// Owner console: pure helpers for the numbers the owner RPCs return (supabase/migrations/0105, 0106).
// Every distinct-user count comes back as a Count: exact, or { value: null, suppressed: true } when it is hidden. A
// count is hidden when it is 1-4, and also when showing it would let someone work out a group of 1-4 by subtracting
// two numbers on the page (0105, privacy rules 1-5), so "hidden" does not always mean "under 5".

export type Count = { value: number | null; suppressed: boolean };

/** Placeholder for "no data" in tables and tiles. */
export const NO_DATA = '–';

const intFmt = new Intl.NumberFormat('en-CA');

/** "12,345", "Hidden" for a withheld count, or a dash when there is no data. */
export function countLabel(c: Count | null | undefined): string {
  if (!c) return NO_DATA;
  if (c.suppressed) return 'Hidden';
  return c.value == null ? NO_DATA : intFmt.format(c.value);
}

/**
 * Turns the is_platform_owner() response into a gate. Only an explicit `true` with no error opens it; anything else
 * (false, null, an error, a network failure) is "denied". The database refuses every owner RPC on its own, so this
 * only decides what the browser shows.
 */
export function ownerGate(res: { data: unknown; error: unknown } | null | undefined): 'owner' | 'denied' {
  return res && !res.error && res.data === true ? 'owner' : 'denied';
}

/** A 0-1 rate as "42%" (or "41.7%" with one decimal). Null means the server withheld it for a small group. */
export function fmtPercent(rate: number | null | undefined, decimals = 0): string {
  if (rate == null || !Number.isFinite(rate)) return NO_DATA;
  return `${(rate * 100).toFixed(decimals)}%`;
}

/** The windows the console's range picker offers, in days. */
export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

/** A range from the URL or a control, clamped to one the picker offers (default 30 days). */
export function clampRange(v: unknown): RangeDays {
  const n = typeof v === 'string' ? Number(v) : v;
  return (RANGES as readonly unknown[]).includes(n) ? (n as RangeDays) : 30;
}

export type Bucket = 'day' | 'week' | 'month';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

/** Reads 'YYYY-MM-DD' as calendar parts, never through Date (which would shift it by the viewer's time zone). */
function parts(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m: m - 1, d };
}
const short = (day: string) => {
  const p = parts(day);
  return `${MONTHS_SHORT[p.m]} ${p.d}`;
};

/** Monday = 0 ... Sunday = 6 for a 'YYYY-MM-DD' day (Postgres date_trunc('week') starts weeks on Monday). */
function weekday(day: string): number {
  const p = parts(day);
  return (new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay() + 6) % 7;
}

/** Whether a bucket spans its whole day, Monday-to-Sunday week or calendar month. */
function wholeBucket(start: string, end: string, bucket: Bucket): boolean {
  if (bucket === 'day') return true;
  if (bucket === 'week') return weekday(start) === 0 && weekday(end) === 6;
  const a = parts(start);
  const b = parts(end);
  return a.d === 1 && b.d === new Date(Date.UTC(b.y, b.m + 1, 0)).getUTCDate();
}

/** A growth bucket's name: full for tables and tooltips, short for chart axes. */
export function bucketLabel(start: string, end: string, bucket: Bucket, compact = false): string {
  const a = parts(start);
  const b = parts(end);
  if (bucket === 'month') {
    if (compact) return MONTHS_SHORT[a.m];
    if (wholeBucket(start, end, bucket)) return `${MONTHS_LONG[a.m]} ${a.y}`;
  }
  if (compact) return short(start);
  if (bucket === 'day' || start === end) return `${short(start)}, ${a.y}`;
  return `${short(start)} to ${short(end)}, ${b.y}`;
}

export type GrowthRow = {
  start: string;
  end: string;
  signups: Count;
  onboarded: Count;
  active: Count;
  practising: Count;
  total: Count;
};
export type SeriesBar = { label: string; title: string; value: number; suppressed: boolean; partial: boolean };

const spansYears = (rows: { start: string; end: string }[]) =>
  rows.length > 0 && parts(rows[0].start).y !== parts(rows[rows.length - 1].end).y;

/**
 * One bar per bucket. A suppressed bucket stays on the axis at zero height, flagged so the chart can mark it.
 * `partial` marks the two buckets that do not cover a whole period: the first, when the range starts partway through
 * a week or month, and the last, which always holds today (fbla_owner_growth ends every range today), so it is the
 * period so far. Month labels carry the year when the range spans two, so the two Octobers of a 12-month range differ.
 */
export function seriesBars<K extends string>(
  rows: ({ start: string; end: string } & Record<K, Count>)[],
  key: K,
  bucket: Bucket,
): SeriesBar[] {
  const withYear = bucket === 'month' && spansYears(rows);
  return rows.map((r, i) => {
    const current = i === rows.length - 1;
    const cut = i === 0 && !wholeBucket(r.start, r.end, bucket);
    const name = bucketLabel(r.start, r.end, bucket);
    const p = parts(r.start);
    return {
      label: withYear ? `${MONTHS_SHORT[p.m]} ’${String(p.y).slice(-2)}` : bucketLabel(r.start, r.end, bucket, true),
      title: current ? `${name} (so far)` : cut ? `${name} (part of the ${bucket})` : name,
      value: r[key].suppressed ? 0 : (r[key].value ?? 0),
      suppressed: r[key].suppressed,
      partial: current || cut,
    };
  });
}

/**
 * The line above the Growth charts: the whole range in words, and why the edge bars are drawn lighter (see
 * seriesBars). Null for an empty series.
 */
export function growthSpan(rows: { start: string; end: string }[], bucket: Bucket): { range: string; partial: string } | null {
  if (!rows.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const a = parts(first.start);
  const b = parts(last.end);
  const range = a.y === b.y ? `${short(first.start)} to ${short(last.end)}, ${b.y}` : `${short(first.start)}, ${a.y} to ${short(last.end)}, ${b.y}`;
  const now = bucket === 'day' ? 'today so far' : `this ${bucket} so far`;
  const cut = rows.length > 1 && !wholeBucket(first.start, first.end, bucket);
  return {
    range,
    partial: cut
      ? `Lighter bars are part periods: the first ${bucket} starts on ${short(first.start)} and the last is ${now}.`
      : `The lighter last bar is ${now}.`,
  };
}

/**
 * What a growth series has to draw. 'zero' and 'hidden' both mean an empty-looking chart: the page says why instead
 * of showing a blank grid ('hidden' usually clears up with a longer bucket, where groups are bigger).
 */
export function seriesState(counts: Count[]): 'empty' | 'zero' | 'hidden' | 'ok' {
  if (!counts.length) return 'empty';
  if (counts.some((c) => !c.suppressed && (c.value ?? 0) > 0)) return 'ok';
  return counts.some((c) => c.suppressed) ? 'hidden' : 'zero';
}

/** The calendar day before a 'YYYY-MM-DD' day, without going through the viewer's time zone. */
function dayBefore(day: string): string {
  const p = parts(day);
  const d = new Date(Date.UTC(p.y, p.m, p.d - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Points for the running-total line: the total the day before the range (the growth RPC's `baseline`), then the
 * total at the end of each bucket. Hidden totals are left out. A point reached across one or more hidden totals
 * carries `gap: true`, so the chart draws that stretch as unknown (dashed, no area) instead of as a known climb.
 */
export function totalPoints(
  series: { start: string; end: string; total: Count }[],
  baseline: Count | null | undefined,
): { x: string; y: number; gap?: boolean }[] {
  if (!series.length) return [];
  const shown = (c: Count | null | undefined) => !!c && !c.suppressed && c.value != null;
  const out: { x: string; y: number; gap?: boolean }[] = [];
  if (shown(baseline)) out.push({ x: dayBefore(series[0].start), y: baseline!.value! });
  let skipped = false;
  for (const r of series) {
    if (!shown(r.total)) {
      skipped = true;
      continue;
    }
    out.push(skipped && out.length ? { x: r.end, y: r.total.value!, gap: true } : { x: r.end, y: r.total.value! });
    skipped = false;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ paging

/** Adds a page of rows to the ones already shown, skipping any it already has (rows shift when new ones arrive). */
export function mergePage<T>(rows: T[], page: T[], idOf: (row: T) => string | number): { rows: T[]; added: number } {
  const seen = new Set(rows.map(idOf));
  const fresh = page.filter((r) => {
    const id = idOf(r);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { rows: fresh.length ? [...rows, ...fresh] : rows, added: fresh.length };
}

/**
 * Loads the first page, then follows offsets until it has at least `want` rows (what was on screen before a reload),
 * the end of the list, or a page that adds nothing. The owner RPCs cap a page at 200 rows; offsets go past that.
 */
export async function loadPages<T, P extends { total: number; rows: T[] }>(
  fetchPage: (offset: number) => Promise<P>,
  want: number,
  idOf: (row: T) => string | number,
): Promise<{ head: P; rows: T[]; total: number; done: boolean }> {
  const head = await fetchPage(0);
  let m = mergePage<T>([], head.rows, idOf);
  let total = head.total;
  let done = m.added === 0 || m.rows.length >= total;
  while (!done && m.rows.length < want) {
    const page = await fetchPage(m.rows.length);
    total = page.total;
    m = mergePage(m.rows, page.rows, idOf);
    done = m.added === 0 || m.rows.length >= total;
  }
  return { head, rows: m.rows, total, done };
}

/** Labels for the actions fbla_audit_log holds (0104 triggers and 0106 owner RPCs). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  member_added: 'Added to chapter',
  chapter_role_changed: 'Role changed',
  member_banned: 'Banned from chapter',
  member_unbanned: 'Unbanned',
  member_removed: 'Removed from chapter',
  trainer_assigned: 'Trainer assigned',
  trainer_removed: 'Trainer removed',
  chapter_deleted: 'Chapter deleted',
  feedback_updated: 'Feedback triaged',
  support_email_viewed: 'Email looked up',
  owner_granted: 'Owner access granted',
  owner_revoked: 'Owner access removed',
};

const words = (s: string) => {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? words(action);
}

type Detail = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A short "what changed" line from an audit row's detail. Empty when there is nothing to add. */
export function auditChange(action: string, detail: Detail | null | undefined): string {
  const d = detail ?? {};
  switch (action) {
    case 'chapter_role_changed':
    case 'feedback_updated': {
      const base = str(d.from) && str(d.to) ? `${words(str(d.from))} to ${words(str(d.to))}` : '';
      const pr = action === 'feedback_updated' && str(d.priority) && d.priority !== 'normal' ? `${d.priority} priority` : '';
      return [base, pr].filter(Boolean).join(', ');
    }
    case 'trainer_assigned':
    case 'trainer_removed':
      return str(d.event) ? words(str(d.event)) : '';
    case 'chapter_deleted':
      // The Affected column already names the chapter.
      return typeof d.members === 'number' ? `${d.members} member${d.members === 1 ? '' : 's'}` : '';
    default:
      return '';
  }
}

/**
 * What an audit entry is about: a username, a chapter's name, "Feedback report", or the target type and a short id.
 * 'start' is for the Affected column; 'inline' follows "on" in a sentence ("on a feedback report").
 */
export function auditTarget(
  r: { target_type: string | null; target_id: string | null; target_username: string | null; detail: Detail | null },
  at: 'start' | 'inline' = 'start',
): string {
  if (r.target_username) return `@${r.target_username}`;
  if (r.target_type === 'chapter' && typeof r.detail?.name === 'string') return r.detail.name;
  if (r.target_type === 'feedback') return at === 'start' ? 'Feedback report' : 'a feedback report';
  if (!r.target_id) return '';
  const t = `${words(r.target_type ?? 'item')} ${r.target_id.slice(0, 8)}`;
  return at === 'start' ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

const OWNER_ONLY = new Set(['feedback_updated', 'support_email_viewed']);

/**
 * Where a change came from: the owner console (its wrappers stamp detail.via, and some actions only exist there),
 * the database itself (no signed-in actor: manual SQL or a scheduled job), or a chapter's own admin tools.
 */
export function auditSource(action: string, detail: Detail | null | undefined, actorId: string | null): string {
  if (detail?.via === 'owner_console' || OWNER_ONLY.has(action)) return 'Owner console';
  if (!actorId) return 'Database';
  return 'Chapter tools';
}

// ------------------------------------------------------------------------------------------------ dates

const torontoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Whole Toronto calendar days from a to b (both instants). */
function dayDiff(a: Date, b: Date): number {
  const ms = (d: Date) => Date.parse(`${torontoDay.format(d)}T00:00:00Z`);
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** "Today", "Yesterday", "3 days ago", or a date past 30 days; "Never" for no date. Toronto days. */
export function dayLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return NO_DATA;
  const n = dayDiff(at, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n <= 30) return `${n} days ago`;
  const day = torontoDay.format(at);
  const p = parts(day);
  return `${MONTHS_SHORT[p.m]} ${p.d}, ${p.y}`;
}

// ------------------------------------------------------------------------------------------------ features

export const FEATURE_LABELS: Record<string, string> = {
  account_created: 'Created an account',
  onboarding_completed: 'Finished sign-up',
  event_selected: 'Chose an event',
  practice_started: 'Started practice',
  practice_completed: 'Finished practice',
  exam_completed: 'Finished a mock exam',
  vocab_session_completed: 'Studied vocab',
  resource_opened: 'Opened a resource',
  duel_started: 'Started a duel',
  duel_completed: 'Finished a duel',
  feedback_submitted: 'Sent feedback',
  install_prompt_shown: 'Saw the install prompt',
  app_installed: 'Installed the app',
  push_enabled: 'Turned on notifications',
};

export function featureLabel(name: string): string {
  return FEATURE_LABELS[name] ?? words(name);
}

/**
 * The "Finished sign-up" figure for one window on Overview: the rate with "x of y" under it, or "Hidden" with the
 * account count under it when the server withheld the profile count (the rate is withheld with it).
 */
export function signupFigure(
  w: { created: Count; onboarded: Count; rate: number | null },
  noun: string,
): { value: string; hidden: boolean; sub: string } {
  const created = w.created.suppressed ? null : w.created.value;
  if (w.onboarded.suppressed)
    return {
      value: 'Hidden',
      hidden: true,
      sub: created == null ? 'hidden for privacy' : `${intFmt.format(created)} ${noun}${created === 1 ? '' : 's'}`,
    };
  if (created === 0) return { value: NO_DATA, hidden: false, sub: `No ${noun}s yet` };
  return { value: fmtPercent(w.rate), hidden: false, sub: `${countLabel(w.onboarded)} of ${countLabel(w.created)}` };
}

/** Growth groupings that make a readable chart for a range: no 365 daily bars, no single monthly bar. */
export function bucketsFor(days: number): Bucket[] {
  if (days <= 7) return ['day'];
  if (days <= 30) return ['day', 'week'];
  if (days <= 90) return ['day', 'week', 'month'];
  return ['week', 'month'];
}

/** Owner actions on a person need a written reason (the audit log keeps it). Null when it is fine. */
export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n < 10) return 'Write a reason of at least 10 characters.';
  if (n > 200) return 'Keep the reason under 200 characters.';
  return null;
}
