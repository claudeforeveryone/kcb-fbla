// weekly-digest: every Monday (pg_cron, 13:00 UTC) each opted-in member gets their week in review, or a
// "we miss you" nudge if they have been idle 7+ days. Sends through Resend; without RESEND_API_KEY it is a
// dry run that returns what it would have sent.
//
// Auth: the x-fbla-token header must match the token in Vault (pg_net adds it; see docs/EMAIL.md).
// Body (all optional): { dry_run?: boolean, user_id?: uuid, limit?: number, preview?: boolean }
//   user_id  only that member (ignores the "joined 2+ days ago" and nudge-cap rules; still once per week)
//   preview  return the rendered HTML of the first email instead of sending

import {
  authorize,
  button,
  card,
  esc,
  firstName,
  json,
  layout,
  maskEmail,
  MUTED,
  NAVY,
  type OutEmail,
  para,
  readBody,
  RED,
  rpc,
  sectionTitle,
  sendAll,
  statGrid,
  textFooter,
  unsubscribeUrl,
  type Config,
} from '../_shared/email.ts';

type Assignment = { id: string; title: string; kind: string; event: string | null; due_at: string | null; due_label: string; due_soon: boolean };
type Recipient = {
  user_id: string;
  email: string;
  display_name: string;
  username: string;
  idle: boolean;
  days_idle: number | null;
  never_played: boolean;
  elo: number;
  peak_elo: number;
  rank: number;
  current_streak: number;
  best_streak: number;
  main_event: string | null;
  main_event_name: string | null;
  chapter_name: string | null;
  unread: number;
  week: { questions: number; correct: number; elo_change: number; days_active: number; top_event: string | null };
  duels: { won: number; played: number };
  pending_duels: number;
  focus: { event: string; event_slug: string; sub: string; accuracy: number } | null;
  assignments: Assignment[];
  newsletter: { id: string; title: string; excerpt: string | null; author: string; created_at: string } | null;
  unsub_sig: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

function assignmentsBlock(list: Assignment[], site: string): { html: string; text: string } {
  if (!list.length) return { html: '', text: '' };
  const rows = list
    .map((a) => {
      const chip = a.due_soon
        ? `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#FCE8EE;color:${RED};font-size:12px;font-weight:700;">${esc(a.due_label)}</span>`
        : `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#EEF2FA;color:${NAVY};font-size:12px;font-weight:600;">${esc(a.due_label)}</span>`;
      return `<tr>
<td style="padding:12px 0;border-bottom:1px solid #EEF1F6;font-family:'Open Sans',Arial,sans-serif;">
  <div style="font-family:'Work Sans',Arial,sans-serif;font-size:15px;font-weight:700;color:${NAVY};">${esc(a.title)}</div>
  ${a.event ? `<div style="margin-top:2px;font-size:13px;color:${MUTED};">${esc(a.event)}</div>` : ''}
</td>
<td align="right" valign="middle" style="padding:12px 0 12px 12px;border-bottom:1px solid #EEF1F6;white-space:nowrap;font-family:'Open Sans',Arial,sans-serif;">${chip}</td>
</tr>`;
    })
    .join('');
  return {
    html:
      sectionTitle('Open assignments') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
<p style="margin:12px 0 0;font-family:'Open Sans',Arial,sans-serif;font-size:14px;"><a href="${esc(site)}/chapter/classroom" style="color:#3F6FB3;font-weight:600;">Open the classroom</a></p>`,
    text:
      '\n\nOPEN ASSIGNMENTS\n' + list.map((a) => `- ${a.title}${a.event ? ` (${a.event})` : ''}: ${a.due_label}`).join('\n'),
  };
}

function newsletterBlock(r: Recipient, site: string): { html: string; text: string } {
  const n = r.newsletter;
  if (!n) return { html: '', text: '' };
  return {
    html:
      sectionTitle(`From ${r.chapter_name ?? 'your chapter'}`) +
      card(
        `<div style="font-family:'Work Sans',Arial,sans-serif;font-size:17px;font-weight:700;color:${NAVY};">${esc(n.title)}</div>
<div style="margin-top:2px;font-family:'Open Sans',Arial,sans-serif;font-size:13px;color:${MUTED};">Newsletter from ${esc(n.author)}</div>
${n.excerpt ? `<p style="margin:10px 0 0;font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#211E1E;">${esc(n.excerpt)}</p>` : ''}
<p style="margin:10px 0 0;font-family:'Open Sans',Arial,sans-serif;font-size:14px;"><a href="${esc(site)}/chapter/classroom" style="color:#3F6FB3;font-weight:600;">Read the full newsletter</a></p>`,
      ),
    text: `\n\nFROM ${(r.chapter_name ?? 'your chapter').toUpperCase()}\n${n.title} (newsletter from ${n.author})\n${n.excerpt ?? ''}`,
  };
}

function focusLine(r: Recipient, site: string): { html: string; text: string } {
  if (!r.focus) return { html: '', text: '' };
  const f = r.focus;
  const url = `${site}/play/${encodeURIComponent(f.event_slug)}`;
  return {
    html:
      sectionTitle('Focus area') +
      card(
        `<div style="font-family:'Work Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:${NAVY};">${esc(f.sub)}</div>
<div style="margin-top:2px;font-family:'Open Sans',Arial,sans-serif;font-size:13px;color:${MUTED};">${esc(f.event)} &middot; ${f.accuracy}% correct so far</div>
<p style="margin:10px 0 0;font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#211E1E;">Your weakest area. A short set here moves your score the most. <a href="${esc(url)}" style="color:#3F6FB3;font-weight:600;">Practise ${esc(f.event)}</a></p>`,
        RED,
      ),
    text: `\n\nFOCUS AREA\n${f.sub} (${f.event}): ${f.accuracy}% correct so far. Practise: ${url}`,
  };
}

function buildDigest(r: Recipient, cfg: Config): OutEmail {
  const site = cfg.site_url;
  const unsub = unsubscribeUrl(cfg, r.user_id, r.unsub_sig);
  const w = r.week;
  const acc = w.questions ? Math.round((100 * w.correct) / w.questions) : 0;
  const name = firstName(r.display_name);
  const elo = w.elo_change;

  const subject =
    elo > 0
      ? `Your week: ${signed(elo)} Elo and ${plural(w.questions, 'question')}`
      : `Your week: ${plural(w.questions, 'question')}, ${acc}% correct`;

  const headline =
    acc >= 90 && w.questions >= 20
      ? 'A sharp week. Your accuracy is competition level.'
      : elo > 0
        ? `You climbed ${elo} Elo. Keep the momentum going.`
        : w.days_active >= 5
          ? 'Five days or more on the board. That is how champions train.'
          : 'Every question counts. Here is where you stand.';

  const stats = statGrid([
    { label: 'Questions answered', value: w.questions.toLocaleString('en-US') },
    { label: 'Accuracy', value: `${acc}%` },
    { label: `Elo change (now ${r.elo})`, value: signed(elo), tone: elo > 0 ? 'up' : elo < 0 ? 'down' : 'flat' },
    { label: 'Day streak', value: String(r.current_streak) },
  ]);

  const extras: string[] = [];
  if (w.top_event) extras.push(`Most practised: <strong>${esc(w.top_event)}</strong>`);
  extras.push(`Overall rank: <strong>#${r.rank}</strong>`);
  if (r.duels.played) extras.push(`Arena: <strong>${r.duels.won} of ${r.duels.played}</strong> duels won`);
  if (r.pending_duels) extras.push(`<a href="${esc(site)}/arena" style="color:${RED};font-weight:700;">${plural(r.pending_duels, 'challenge')} waiting for you</a>`);

  const a = assignmentsBlock(r.assignments, site);
  const n = newsletterBlock(r, site);
  const f = focusLine(r, site);

  const body = [
    para(`Hi ${esc(name)}, ${esc(headline.charAt(0).toLowerCase() + headline.slice(1))}`),
    stats,
    `<p style="margin:16px 0 0;font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.8;color:#211E1E;">${extras.join(' &nbsp;&middot;&nbsp; ')}</p>`,
    a.html,
    n.html,
    f.html,
    `<div style="margin-top:28px;">${button(r.current_streak > 0 ? 'Keep your streak alive' : 'Start a practice set', `${site}/play`)}</div>`,
  ].join('\n');

  const reason = `You get this weekly summary because email updates are on for @${r.username}.`;
  const html = layout({
    cfg,
    preheader: `${plural(w.questions, 'question')}, ${acc}% correct, ${signed(elo)} Elo. ${r.assignments.length ? `${plural(r.assignments.length, 'assignment')} open.` : ''}`,
    eyebrow: 'Your week in review',
    title: `Nice work, ${name}`,
    subtitle: `${plural(w.days_active, 'day')} active this week${r.chapter_name ? ` · ${r.chapter_name}` : ''}`,
    body,
    reason,
    unsubscribeUrl: unsub,
  });

  const text =
    `Hi ${name},\n\nYOUR WEEK\n` +
    `Questions: ${w.questions}\nAccuracy: ${acc}%\nElo change: ${signed(elo)} (now ${r.elo}, rank #${r.rank})\nDay streak: ${r.current_streak}` +
    (r.pending_duels ? `\nArena: ${plural(r.pending_duels, 'challenge')} waiting` : '') +
    a.text +
    n.text +
    f.text +
    `\n\nPractise now: ${site}/play` +
    textFooter(reason, unsub, site);

  return { user_id: r.user_id, to: r.email, subject, html, text, unsubscribe_url: unsub, kind: 'digest' };
}

function buildNudge(r: Recipient, cfg: Config): OutEmail {
  const site = cfg.site_url;
  const unsub = unsubscribeUrl(cfg, r.user_id, r.unsub_sig);
  const name = firstName(r.display_name);
  const fresh = r.never_played;
  const event = r.main_event_name;
  const playUrl = r.main_event ? `${site}/play/${encodeURIComponent(r.main_event)}` : `${site}/play`;

  const subject = fresh
    ? `${name}, your first FBLA practice set is waiting`
    : `We miss you, ${name}`;

  const lead = fresh
    ? para(
        `Hi ${esc(name)}, you joined FBLA United but have not taken a practice set yet. ${event ? `A 10-question <strong>${esc(event)}</strong> set takes about five minutes` : 'A 10-question set takes about five minutes'}, and every answer starts building your Elo rating and your spot on the leaderboard.`,
      )
    : para(
        `Hi ${esc(name)}, it has been ${r.days_idle ? `${r.days_idle} days` : 'a while'} since your last practice. Your rating is waiting right where you left it: <strong>${r.elo} Elo</strong>, rank <strong>#${r.rank}</strong>${r.best_streak > 1 ? `, with a best streak of <strong>${r.best_streak} days</strong> to beat` : ''}.`,
      );

  const tips = card(
    `<div style="font-family:'Work Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:${NAVY};">Five minutes is enough</div>
<ul style="margin:10px 0 0;padding-left:20px;font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#211E1E;">
<li>Take a quick 10-question set${event ? ` in ${esc(event)}` : ''}.</li>
<li>Flip through vocab flashcards for your event.</li>
<li>Challenge a chapter member to a 1v1 in the Arena.</li>
</ul>`,
  );

  const a = assignmentsBlock(r.assignments, site);
  const n = newsletterBlock(r, site);
  const f = fresh ? { html: '', text: '' } : focusLine(r, site);
  const duelLine = r.pending_duels
    ? para(`<a href="${esc(site)}/arena" style="color:${RED};font-weight:700;">${plural(r.pending_duels, 'challenge is', 'challenges are')} waiting for you in the Arena.</a>`, 'margin-top:16px;')
    : '';

  const body = [
    lead,
    tips,
    duelLine,
    a.html,
    n.html,
    f.html,
    `<div style="margin-top:28px;">${button(fresh ? 'Take my first set' : 'Jump back in', playUrl)}</div>`,
  ].join('\n');

  const reason = `You get occasional reminders because email updates are on for @${r.username}.`;
  const html = layout({
    cfg,
    preheader: fresh ? 'Five minutes, ten questions, your first Elo rating.' : `You are at ${r.elo} Elo, rank #${r.rank}. Pick up where you left off.`,
    eyebrow: fresh ? 'Get started' : 'We miss you',
    title: fresh ? `Ready when you are, ${name}` : `Come back and play, ${name}`,
    subtitle: r.chapter_name ? `${r.chapter_name} is practising this week` : 'Your next practice set is one click away',
    body,
    reason,
    unsubscribeUrl: unsub,
  });

  const text =
    `Hi ${name},\n\n` +
    (fresh
      ? `You joined FBLA United but have not taken a practice set yet. A 10-question set takes about five minutes.`
      : `It has been ${r.days_idle ?? 'a few'} days since your last practice. You are at ${r.elo} Elo, rank #${r.rank}.`) +
    (r.pending_duels ? `\n\n${plural(r.pending_duels, 'Arena challenge')} waiting: ${site}/arena` : '') +
    a.text +
    n.text +
    f.text +
    `\n\nJump back in: ${playUrl}` +
    textFooter(reason, unsub, site);

  return { user_id: r.user_id, to: r.email, subject, html, text, unsubscribe_url: unsub, kind: 'nudge' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  let cfg: Config | null;
  try {
    cfg = await authorize(req);
  } catch (e) {
    console.error('[weekly-digest] config lookup failed', e);
    return json({ error: 'config lookup failed' }, 500);
  }
  if (!cfg) return json({ error: 'unauthorized' }, 401);

  const body = await readBody(req);
  const dryRun = body.dry_run === true || body.preview === true;
  const userId = typeof body.user_id === 'string' ? body.user_id : null;
  const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(2000, Math.floor(body.limit))) : 500;

  const summary = {
    week: cfg.week,
    dry_run: dryRun,
    reason: undefined as string | undefined,
    digests: 0,
    nudges: 0,
    sent: 0,
    failed: 0,
    sample: [] as { to: string; kind: string; subject: string }[],
  };

  // Logged sends drop out of the next page, so loop until nothing is left (one page for dry runs).
  for (let page = 0; page < 20; page++) {
    const recipients = await rpc<Recipient[]>('fbla_email_digest_recipients', {
      p_week: cfg.week,
      p_user: userId,
      p_limit: limit,
    });
    if (!recipients?.length) break;

    const emails = recipients.map((r) => (r.idle ? buildNudge(r, cfg!) : buildDigest(r, cfg!)));
    if (body.preview === true) {
      const e = emails[0];
      return json({ to: maskEmail(e.to), kind: e.kind, subject: e.subject, text: e.text, html: e.html });
    }

    for (const e of emails) {
      if (e.kind === 'digest') summary.digests++;
      else summary.nudges++;
      if (summary.sample.length < 10) summary.sample.push({ to: maskEmail(e.to), kind: e.kind, subject: e.subject });
    }

    const res = await sendAll(emails, cfg, dryRun);
    if (res.dry_run) {
      summary.dry_run = true;
      summary.reason = res.reason;
      break;
    }
    summary.sent += res.sent.length;
    summary.failed += res.failed.length;
    const kindOf = new Map(emails.map((e) => [e.user_id, e.kind]));
    for (const kind of ['digest', 'nudge']) {
      const rows = res.sent.filter((s) => kindOf.get(s.user_id) === kind);
      if (rows.length) await rpc('fbla_email_log_sent', { p_kind: kind, p_ref: cfg.week, p_rows: rows });
    }
    // stop when a page had failures (the next page would retry them right away) or nothing was logged
    if (userId || res.failed.length > 0 || res.sent.length === 0) break;
  }

  console.log(`[weekly-digest] ${JSON.stringify({ ...summary, sample: undefined })}`);
  return json(summary);
});
