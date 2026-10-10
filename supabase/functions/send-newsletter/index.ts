// send-newsletter: emails a chapter newsletter to every member who has email updates on.
// Called by the database (pg_net) right after a post with kind = 'newsletter' is inserted.
//
// Auth: x-fbla-token header (Vault token). Body: { post_id: uuid, dry_run?: boolean, preview?: boolean }
// Idempotent: each member gets a given newsletter at most once (fbla_private.email_log).

import {
  authorize,
  button,
  esc,
  firstName,
  json,
  layout,
  maskEmail,
  mdLite,
  MUTED,
  NAVY,
  type OutEmail,
  readBody,
  rpc,
  sendAll,
  textFooter,
  unsubscribeUrl,
  type Config,
} from '../_shared/email.ts';

type Payload = {
  post: { id: string; title: string; body: string | null; url: string | null; event: string | null; created_at: string };
  author: { display_name: string; username: string; role: string | null } | null;
  chapter: { id: string; name: string; school: string | null } | null;
  recipients: { user_id: string; email: string; display_name: string; unsub_sig: string }[];
};

const ROLE: Record<string, string> = { president: 'President', executive: 'Executive', trainer: 'Trainer', member: 'Member' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function build(p: Payload, r: Payload['recipients'][number], cfg: Config): OutEmail {
  const site = cfg.site_url;
  const unsub = unsubscribeUrl(cfg, r.user_id, r.unsub_sig);
  const chapter = p.chapter?.name ?? 'Your chapter';
  const author = p.author
    ? `${p.author.display_name}${p.author.role ? `, ${ROLE[p.author.role] ?? p.author.role}` : ''}`
    : chapter;
  const date = new Date(p.post.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Toronto',
  });

  const byline = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-bottom:1px solid #EEF1F6;">
<tr><td style="padding:0 0 16px;font-family:'Open Sans',Arial,sans-serif;font-size:13px;color:${MUTED};">
  <span style="font-family:'Work Sans',Arial,sans-serif;font-size:14px;font-weight:700;color:${NAVY};">${esc(author)}</span><br>${esc(date)}${p.post.event ? ` &middot; ${esc(p.post.event)}` : ''}
</td></tr></table>`;

  const greeting = `<p style="margin:0 0 14px;font-family:'Open Sans',Arial,sans-serif;font-size:15px;line-height:1.65;color:#211E1E;">Hi ${esc(firstName(r.display_name))},</p>`;
  const content = mdLite(p.post.body) || '';
  const link = p.post.url
    ? `<p style="margin:4px 0 18px;font-family:'Open Sans',Arial,sans-serif;font-size:14px;"><a href="${esc(p.post.url)}" style="color:#3F6FB3;font-weight:600;word-break:break-all;">${esc(p.post.url)}</a></p>`
    : '';

  const body = [
    byline,
    greeting,
    content,
    link,
    `<div style="margin-top:24px;">${button('Open in the classroom', `${site}/chapter/classroom`, 'navy')}</div>`,
  ].join('\n');

  const reason = `You get ${chapter} newsletters because you are a member and email updates are on.`;
  const html = layout({
    cfg,
    preheader: (p.post.body ?? '').replace(/[*_#>`[\]]/g, '').replace(/\s+/g, ' ').slice(0, 140),
    eyebrow: `${chapter} newsletter`,
    title: p.post.title,
    subtitle: p.chapter?.school ?? undefined,
    body,
    reason,
    unsubscribeUrl: unsub,
  });

  const text =
    `${p.post.title}\n${author} · ${date}\n\nHi ${firstName(r.display_name)},\n\n${p.post.body ?? ''}` +
    (p.post.url ? `\n\n${p.post.url}` : '') +
    `\n\nOpen in the classroom: ${site}/chapter/classroom` +
    textFooter(reason, unsub, site);

  return {
    user_id: r.user_id,
    to: r.email,
    subject: `${chapter}: ${p.post.title}`,
    html,
    text,
    unsubscribe_url: unsub,
    kind: 'newsletter',
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let cfg: Config | null;
  try {
    cfg = await authorize(req);
  } catch (e) {
    console.error('[send-newsletter] config lookup failed', e);
    return json({ error: 'config lookup failed' }, 500);
  }
  if (!cfg) return json({ error: 'unauthorized' }, 401);

  const body = await readBody(req);
  const postId = typeof body.post_id === 'string' ? body.post_id : '';
  if (!UUID.test(postId)) return json({ error: 'post_id is required' }, 400);

  const payload = await rpc<Payload | null>('fbla_email_newsletter', { p_post: postId });
  if (!payload) return json({ error: 'newsletter not found' }, 404);

  const emails = payload.recipients.map((r) => build(payload, r, cfg!));
  if (body.preview === true) {
    const e = emails[0];
    if (!e) return json({ error: 'no recipients' }, 404);
    return json({ to: maskEmail(e.to), subject: e.subject, text: e.text, html: e.html });
  }

  const res = await sendAll(emails, cfg, body.dry_run === true);
  if (!res.dry_run && res.sent.length) {
    await rpc('fbla_email_log_sent', { p_kind: 'newsletter', p_ref: postId, p_rows: res.sent });
  }
  const summary = {
    post_id: postId,
    chapter: payload.chapter?.name ?? null,
    recipients: emails.length,
    dry_run: res.dry_run,
    reason: res.reason,
    sent: res.sent.length,
    failed: res.failed.length,
    sample: emails.slice(0, 5).map((e) => ({ to: maskEmail(e.to), subject: e.subject })),
  };
  console.log(`[send-newsletter] ${JSON.stringify({ ...summary, sample: undefined })}`);
  return json(summary);
});
