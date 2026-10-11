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

/** A growth bucket's name: full for tables and tooltips, short for chart axes. */
export function bucketLabel(start: string, end: string, bucket: Bucket, compact = false): string {
  const a = parts(start);
  const b = parts(end);
  if (bucket === 'month') {
    const whole = a.d === 1 && b.d === new Date(Date.UTC(b.y, b.m + 1, 0)).getUTCDate();
    if (compact) return MONTHS_SHORT[a.m];
    if (whole) return `${MONTHS_LONG[a.m]} ${a.y}`;
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
export type SeriesBar = { label: string; title: string; value: number; suppressed: boolean };

/** One bar per bucket. A suppressed bucket stays on the axis at zero height, flagged so the chart can mark it. */
export function seriesBars<K extends string>(
  rows: ({ start: string; end: string } & Record<K, Count>)[],
  key: K,
  bucket: Bucket,
): SeriesBar[] {
  return rows.map((r) => ({
    label: bucketLabel(r.start, r.end, bucket, true),
    title: bucketLabel(r.start, r.end, bucket),
    value: r[key].suppressed ? 0 : (r[key].value ?? 0),
    suppressed: r[key].suppressed,
  }));
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
 * total at the end of each bucket. Hidden totals are left out, so the line joins the totals it can show.
 */
export function totalPoints(
  series: { start: string; end: string; total: Count }[],
  baseline: Count | null | undefined,
): { x: string; y: number }[] {
  if (!series.length) return [];
  const shown = (c: Count | null | undefined) => !!c && !c.suppressed && c.value != null;
  const out: { x: string; y: number }[] = [];
  if (shown(baseline)) out.push({ x: dayBefore(series[0].start), y: baseline!.value! });
  for (const r of series) if (shown(r.total)) out.push({ x: r.end, y: r.total.value! });
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
    case 'chapter_deleted': {
      const m = typeof d.members === 'number' ? `${d.members} member${d.members === 1 ? '' : 's'}` : '';
      return [str(d.name), m].filter(Boolean).join(', ');
    }
    default:
      return '';
  }
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
