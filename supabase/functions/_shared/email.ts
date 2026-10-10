// Shared helpers for the KCB FBLA email edge functions (weekly-digest, send-newsletter, email-unsubscribe).
// Brand: FBLC palette (navy #001E60, red #BF0D3E, blue #3F6FB3), Work Sans headings, Open Sans body.

export const NAVY = '#001E60';
export const RED = '#BF0D3E';
export const BLUE = '#3F6FB3';
export const BG = '#F5F7FB';
export const INK = '#211E1E';
export const MUTED = '#5B6478';
export const LINE = '#DDE3EE';
export const SUCCESS = '#1E8E5A';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export type Config = {
  ok: boolean;
  site_url: string;
  functions_url: string;
  email_from: string;
  reply_to: string | null;
  /** ISO week in America/Toronto, e.g. 2026-W41 (the digest's idempotency key). */
  week: string;
};

/** Call a public.* RPC with the service role (the email RPCs are granted to service_role only). */
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${name} failed (${res.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Checks the x-fbla-token header against the token in Vault; returns config when it matches. */
export async function authorize(req: Request): Promise<Config | null> {
  const token = req.headers.get('x-fbla-token') ?? '';
  if (!token || token.length < 32) return null;
  const cfg = await rpc<Config>('fbla_email_config', { p_token: token });
  return cfg?.ok ? cfg : null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') return {};
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------------------------------- sending
export type OutEmail = {
  user_id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribe_url: string;
  kind: string;
};

export type SendResult = {
  dry_run: boolean;
  reason?: string;
  sent: { user_id: string; provider_id: string | null }[];
  failed: { user_id: string; error: string }[];
};

const RESEND_URL = 'https://api.resend.com/emails/batch';

/** Sends through Resend's batch API (100 per call). Without RESEND_API_KEY (or with dryRun) nothing is sent. */
export async function sendAll(emails: OutEmail[], cfg: Config, dryRun = false): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key || dryRun) {
    const reason = !key ? 'RESEND_API_KEY is not set' : 'dry_run requested';
    console.log(`[email] dry run (${reason}): ${emails.length} email(s) prepared, none sent`);
    return { dry_run: true, reason, sent: [], failed: [] };
  }
  const out: SendResult = { dry_run: false, sent: [], failed: [] };
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const payload = chunk.map((e) => ({
      from: cfg.email_from,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      text: e.text,
      ...(cfg.reply_to ? { reply_to: cfg.reply_to } : {}),
      headers: {
        'List-Unsubscribe': `<${e.unsubscribe_url}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [{ name: 'kind', value: e.kind }],
    }));
    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { message?: string })?.message ?? `HTTP ${res.status}`;
        console.error(`[email] Resend batch failed: ${msg}`);
        for (const e of chunk) out.failed.push({ user_id: e.user_id, error: msg });
        continue;
      }
      const ids = ((body as { data?: { id: string }[] })?.data ?? []).map((d) => d.id);
      chunk.forEach((e, j) => out.sent.push({ user_id: e.user_id, provider_id: ids[j] ?? null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[email] Resend request error: ${msg}`);
      for (const e of chunk) out.failed.push({ user_id: e.user_id, error: msg });
    }
  }
  return out;
}

/** a***@example.com, for logs and dry-run output. */
export function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return '***';
  return `${u.slice(0, 1)}***@${d}`;
}

export function unsubscribeUrl(cfg: Config, userId: string, sig: string): string {
  return `${cfg.functions_url}/email-unsubscribe?u=${encodeURIComponent(userId)}&s=${encodeURIComponent(sig)}`;
}

// ------------------------------------------------------------------------------------------- html helpers
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_HEAD = `'Work Sans', 'Segoe UI', Arial, sans-serif`;
const FONT_BODY = `'Open Sans', 'Segoe UI', Arial, sans-serif`;

export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

/** Markdown-lite (as the classroom uses it) to safe email HTML: headings, bold, italic, links, lists, paragraphs. */
export function mdLite(src: string | null | undefined): string {
  if (!src) return '';
  const inline = (t: string) =>
    esc(t)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) =>
        `<a href="${url}" style="color:${BLUE};text-decoration:underline;">${label}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) =>
        `${pre}<a href="${url}" style="color:${BLUE};text-decoration:underline;">${url}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>');
  const p = `margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};`;
  const blocks = src.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return '';
      const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
      if (h && lines.length === 1) {
        const size = h[1].length === 1 ? 20 : h[1].length === 2 ? 18 : 16;
        return `<h3 style="margin:22px 0 8px;font-family:${FONT_HEAD};font-size:${size}px;font-weight:700;color:${NAVY};">${inline(h[2])}</h3>`;
      }
      if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ordered = /^\s*\d/.test(lines[0]);
        const tag = ordered ? 'ol' : 'ul';
        const items = lines
          .map((l) => `<li style="margin:0 0 6px;">${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`)
          .join('');
        return `<${tag} style="margin:0 0 14px;padding-left:22px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">${items}</${tag}>`;
      }
      if (lines.every((l) => /^>\s?/.test(l))) {
        return `<div style="margin:0 0 14px;padding:10px 14px;border-left:3px solid ${BLUE};background:#F0F4FB;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">${lines
          .map((l) => inline(l.replace(/^>\s?/, '')))
          .join('<br>')}</div>`;
      }
      return `<p style="${p}">${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/** Red pill call-to-action button (bulletproof table button). */
export function button(label: string, href: string, tone: 'red' | 'navy' = 'red'): string {
  const bg = tone === 'red' ? RED : NAVY;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:10px;background:${bg};">
<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT_HEAD};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}&nbsp;&rarr;</a>
</td></tr></table>`;
}

export function sectionTitle(label: string): string {
  return `<div style="margin:28px 0 12px;font-family:${FONT_HEAD};font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">
<span style="display:inline-block;width:18px;height:3px;background:${RED};border-radius:2px;vertical-align:middle;margin-right:8px;"></span>${esc(label)}</div>`;
}

/** 2x2 grid of stat tiles. */
export function statGrid(stats: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }[]): string {
  const cell = (s: { label: string; value: string; tone?: 'up' | 'down' | 'flat' } | undefined) => {
    if (!s) return '<td width="50%" style="padding:6px;"></td>';
    const color = s.tone === 'up' ? SUCCESS : s.tone === 'down' ? RED : NAVY;
    return `<td width="50%" valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;background:#FFFFFF;">
<tr><td style="padding:16px 18px;">
<div style="font-family:${FONT_HEAD};font-size:28px;line-height:1.1;font-weight:800;color:${color};font-variant-numeric:tabular-nums;">${esc(s.value)}</div>
<div style="margin-top:4px;font-family:${FONT_BODY};font-size:13px;color:${MUTED};">${esc(s.label)}</div>
</td></tr></table></td>`;
  };
  let rows = '';
  for (let i = 0; i < stats.length; i += 2) rows += `<tr>${cell(stats[i])}${cell(stats[i + 1])}</tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

export function card(inner: string, accent: string = BLUE): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-left:4px solid ${accent};border-radius:12px;background:#FFFFFF;">
<tr><td style="padding:16px 18px;">${inner}</td></tr></table>`;
}

export function para(html: string, extra = ''): string {
  return `<p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};${extra}">${html}</p>`;
}

/** Full branded email document. `body` is trusted HTML built with the helpers above. */
export function layout(opts: {
  cfg: Config;
  preheader: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  body: string;
  reason: string;
  unsubscribeUrl: string;
}): string {
  const { cfg } = opts;
  const site = cfg.site_url;
  const logo = `${site}/brand/fblc-logo-white.webp`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Work+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  @media (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 26px !important; }
  }
  a { color: ${BLUE}; }
</style>
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
<tr><td align="center" style="padding:24px 12px 40px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

<!-- brand bar -->
<tr><td bgcolor="${NAVY}" style="background:${NAVY};background-image:linear-gradient(135deg,${NAVY} 0%,${NAVY} 58%,#0B2C78 58%,#0B2C78 74%,#123A8F 74%);border-radius:14px 14px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:22px 32px 0;">
  <a href="${esc(site)}" style="text-decoration:none;">
  <img src="${esc(logo)}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;height:40px;width:auto;">
  <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${FONT_HEAD};font-size:19px;font-weight:800;letter-spacing:0.4px;color:#FFFFFF;">KCB FBLA</span>
  </a>
</td></tr>
<tr><td class="pad" style="padding:26px 32px 30px;">
  <div style="font-family:${FONT_HEAD};font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.72);">
    <span style="display:inline-block;width:20px;height:3px;background:${RED};border-radius:2px;vertical-align:middle;margin-right:8px;"></span>${esc(opts.eyebrow)}
  </div>
  <h1 class="h1" style="margin:10px 0 0;font-family:${FONT_HEAD};font-size:30px;line-height:1.2;font-weight:800;color:#FFFFFF;">${esc(opts.title)}</h1>
  ${opts.subtitle ? `<p style="margin:10px 0 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);">${esc(opts.subtitle)}</p>` : ''}
</td></tr>
</table>
</td></tr>
<tr><td height="4" bgcolor="${RED}" style="height:4px;line-height:4px;font-size:0;background:${RED};">&nbsp;</td></tr>

<!-- body -->
<tr><td class="pad" bgcolor="#FFFFFF" style="background:#FFFFFF;padding:28px 32px 32px;border:1px solid ${LINE};border-top:0;border-radius:0 0 14px 14px;">
${opts.body}
</td></tr>

<!-- footer -->
<tr><td class="pad" style="padding:22px 32px 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
  ${esc(opts.reason)}<br>
  <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
  &nbsp;&middot;&nbsp;
  <a href="${esc(site)}/me/settings" style="color:${MUTED};text-decoration:underline;">Email settings</a>
  &nbsp;&middot;&nbsp;
  <a href="${esc(site)}" style="color:${MUTED};text-decoration:underline;">Open KCB FBLA</a>
  <div style="margin-top:10px;font-family:${FONT_HEAD};font-weight:700;letter-spacing:0.4px;color:${NAVY};">KCB FBLA &middot; Future Business Leaders</div>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Plain-text footer shared by every email. */
export function textFooter(reason: string, unsub: string, site: string): string {
  return `\n\n--\n${reason}\nUnsubscribe: ${unsub}\nEmail settings: ${site}/me/settings\nKCB FBLA`;
}
