// DEV ONLY. Made-up data for the owner console in the component gallery (/dev/ui?only=owner for a busy site,
// /dev/ui?only=owner-small for a small one). Imported only by src/components/ui/Gallery.tsx, which App.tsx loads only
// when import.meta.env.DEV, so none of this reaches a production build: `npm run build` ends with
// scripts/check-dist.mjs, which fails when dist/ contains FIXTURE_MARKER. The marker is a field of every value this
// file exports (fixtures.test.ts checks), so any bundle that pulls in fixture data carries it too, whatever imports
// it. Never use it anywhere else. Hidden counts
// follow the same rules as 0105: 1-4 is hidden, a running total is hidden when it would reveal a group of 1-4 next to
// the total after it, a group inside an account total is hidden when it is 1-4 below it, and a group is hidden when it
// is 1-4 above a smaller group inside it that is shown.
import type {
  AuditRow,
  OwnerContent,
  OwnerEngagement,
  OwnerFeedbackRow,
  OwnerGrowth,
  OwnerOverview,
  OwnerPreparation,
  OwnerQuestion,
  OwnerUserRow,
} from '../../api/owner';
import type { FeedbackStatus } from '../../lib/feedback';
import type { Bucket, Count, GrowthRow } from '../../lib/owner';
import type { OwnerSource } from './shared';

export const FIXTURE_MARKER = 'omega-owner-fixture-data';

/** A fixture data source: the console's OwnerSource, tagged so check-dist can find it in a bundle. */
export type FixtureSource = OwnerSource & { readonly fixture: typeof FIXTURE_MARKER };

type Site = 'busy' | 'small';

const c = (value: number): Count => (value >= 1 && value <= 4 ? { value: null, suppressed: true } : { value, suppressed: false });
const hidden: Count = { value: null, suppressed: true };
/** fbla_count_over: also hidden when 1-4 above any shown group inside it. */
const cOver = (value: number, inside: Count[]): Count =>
  inside.some((s) => !s.suppressed && s.value != null && value - s.value >= 1 && value - s.value <= 4) ? hidden : c(value);
/** fbla_count_under: also hidden when 1-4 below any shown group that holds it (null: that group is hidden). */
const cUnder = (value: number, outer: (number | null)[]): Count =>
  outer.some((o) => o != null && o - value >= 1 && o - value <= 4) ? hidden : c(value);
const NOW = '2026-10-11T14:20:00Z';

const overviews: Record<Site, OwnerOverview> = {
  busy: {
    generated_at: NOW,
    timezone: 'America/Toronto',
    tracking_since: '2026-09-02T13:05:00Z',
    accounts: c(412),
    new_accounts: { day: hidden, week: c(38), month: c(121) },
    active: { dau: c(57), wau: c(188), mau: c(301) },
    returning: c(164),
    returning_rate: 0.545,
    onboarding: {
      month: { created: c(121), onboarded: c(104), rate: 0.86 },
      all_time: { created: c(412), onboarded: c(371), rate: 0.901 },
    },
    answered_week: { users: c(143), questions: 9874 },
  },
  // 23 accounts. This month's sign-up split is 10 and 2, so both halves are hidden (the 2x2 rule in 0105). 17 active
  // this month is 1 below the 18 who finished sign-up, so the month's count is hidden too, and with it the rate.
  // 3 students answered questions this week: hidden, and the question count with it (0105 returns null for both).
  small: {
    generated_at: NOW,
    timezone: 'America/Toronto',
    tracking_since: '2026-09-20T13:05:00Z',
    accounts: c(23),
    new_accounts: { day: c(0), week: hidden, month: c(12) },
    active: { dau: hidden, wau: cUnder(11, [23, 18]), mau: cUnder(17, [23, 18]) },
    returning: cUnder(9, [23, 18]),
    returning_rate: null,
    onboarding: {
      month: { created: c(12), onboarded: hidden, rate: null },
      all_time: { created: c(23), onboarded: c(18), rate: 0.783 },
    },
    answered_week: { users: hidden, questions: null },
  },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Day, week (Monday start) or month buckets over the last `days` days up to Oct 11, 2026. */
function bucketsOf(days: number, bucket: Bucket): { s: Date; e: Date }[] {
  const end = new Date(Date.UTC(2026, 9, 11));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const out: { s: Date; e: Date }[] = [];
  const cur = new Date(start);
  if (bucket === 'week') cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
  if (bucket === 'month') cur.setUTCDate(1);
  while (cur <= end) {
    const s = new Date(cur);
    if (bucket === 'day') cur.setUTCDate(cur.getUTCDate() + 1);
    else if (bucket === 'week') cur.setUTCDate(cur.getUTCDate() + 7);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
    const e = new Date(cur);
    e.setUTCDate(e.getUTCDate() - 1);
    out.push({ s: s < start ? start : s, e: e > end ? end : e });
  }
  return out;
}

// Deterministic wiggle so the charts look like real traffic without randomness between renders.
const wave = (i: number, base: number, amp: number) => Math.max(0, Math.round(base + amp * Math.sin(i * 0.9) + (i % 5) * (amp / 4)));

/** Raw per-bucket numbers before hiding: sign-ups, profiles made, active and practising students. */
function rawBucket(site: Site, bucket: Bucket, i: number) {
  if (site === 'small') {
    if (bucket === 'day')
      return {
        signups: [0, 1, 0, 0, 2, 0, 0, 0, 1, 0][i % 10],
        onboarded: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0][i % 10],
        active: [2, 0, 3, 1, 0, 4, 2][i % 7],
        practising: [1, 0, 2, 0, 0, 3, 1][i % 7],
      };
    if (bucket === 'week')
      return { signups: i % 3 === 0 ? 6 : 3, onboarded: i % 3 === 0 ? 5 : 2, active: 7 + (i % 3), practising: 5 + (i % 2) };
    return { signups: 13 + (i % 2) * 2, onboarded: 11, active: 12, practising: 8 };
  }
  const scale = bucket === 'day' ? 1 : bucket === 'week' ? 6 : 24;
  const signups = i % 7 === 3 && bucket === 'day' ? 2 : wave(i, 4 * scale, 2 * scale);
  // About 57 a day, 188 a week and 301 a month, like the busy Overview.
  const reach = bucket === 'day' ? 1 : bucket === 'week' ? 1.6 : 1.18;
  return {
    signups,
    onboarded: Math.round(signups * 0.86),
    active: wave(i + 2, 52 * Math.sqrt(scale) * reach, 12),
    practising: wave(i + 4, 38 * Math.sqrt(scale) * reach, 10),
  };
}

/**
 * Running totals hidden the way fbla_account_totals does it: walking back from the newest, a total shows only when
 * it is 0 or 5+ and 0 or 5+ away from the last total shown after it. Sign-ups show only between two shown totals.
 */
function hideTotals(totals: number[]): boolean[] {
  const shown = totals.map(() => false);
  let later: number | null = null;
  for (let i = totals.length - 1; i >= 0; i--) {
    const t = totals[i];
    const gap = later == null ? 0 : later - t;
    if ((t === 0 || t >= 5) && (gap === 0 || gap >= 5)) {
      shown[i] = true;
      later = t;
    }
  }
  return shown;
}

function growth(site: Site, days: number, bucket: Bucket): OwnerGrowth {
  const buckets = bucketsOf(days, bucket);
  const raw = buckets.map((_, i) => rawBucket(site, bucket, i));
  const now = site === 'small' ? 23 : 412;
  // Over a long range the made-up sign-ups would add up to more accounts than the site has. Count back from today
  // instead: the site launched in the bucket where they reach today's total, and had no accounts before it.
  const signups = raw.map(() => 0);
  let left = now;
  for (let i = raw.length - 1; i >= 0 && left > 0; i--) {
    signups[i] = Math.min(raw[i].signups, left);
    left -= signups[i];
  }
  const totals = [left];
  for (const n of signups) totals.push(totals[totals.length - 1] + n);
  const shown = hideTotals(totals);
  const total = (i: number): Count => (shown[i] ? { value: totals[i], suppressed: false } : hidden);
  // The first shown total at or after a bucket's end: everyone counted in the bucket is inside it (fbla_count_under).
  const outer = (i: number) => totals.find((_, j) => j > i && shown[j]) ?? null;
  const series: GrowthRow[] = buckets.map((b, i) => {
    // Profiles come from that bucket's sign-ups, and no more students are active than there are accounts.
    const onboarded = Math.min(raw[i].onboarded, signups[i]);
    const active = Math.min(raw[i].active, Math.floor(totals[i + 1] * 0.75));
    const practising = Math.min(raw[i].practising, active);
    const onboardedC = cUnder(onboarded, [outer(i)]);
    const practisingC = cUnder(practising, [outer(i)]);
    const activeUnder = cUnder(active, [outer(i)]);
    return {
      start: iso(b.s),
      end: iso(b.e),
      signups: shown[i] && shown[i + 1] ? { value: totals[i + 1] - totals[i], suppressed: false } : hidden,
      onboarded: onboardedC,
      active: activeUnder.suppressed ? activeUnder : cOver(active, [practisingC, onboardedC]),
      practising: practisingC,
      total: total(i + 1),
    };
  });
  return { days, bucket, timezone: 'America/Toronto', baseline: total(0), series };
}

const engagement = (site: Site, days: number): OwnerEngagement => {
  if (site === 'small')
    return {
      days,
      features: [
        { name: 'event_selected', users: c(9), events: 14 },
        { name: 'practice_started', users: c(7), events: 15 },
        { name: 'onboarding_completed', users: c(6), events: 6 },
        { name: 'vocab_session_completed', users: hidden, events: null },
        { name: 'resource_opened', users: hidden, events: null },
        { name: 'feedback_submitted', users: hidden, events: null },
      ],
      modes: [
        { mode: 'practice', users: c(6) },
        { mode: 'daily', users: hidden },
      ],
      practice: { started: { users: c(7), events: 15 }, completed: { users: hidden, events: null }, completion_rate: null },
      duels: { players: c(0), created: 0, completed: 0 },
      popular_events: [
        { code: 'accounting', users: c(6) },
        { code: 'marketing', users: hidden },
      ],
    };
  const k = days / 30;
  const n = (v: number) => Math.round(v * Math.min(k, 3));
  return {
    days,
    features: [
      { name: 'event_selected', users: c(n(266)), events: n(902) },
      { name: 'practice_started', users: c(n(240)), events: n(1840) },
      { name: 'vocab_session_completed', users: c(n(131)), events: n(486) },
      { name: 'onboarding_completed', users: c(n(104)), events: n(104) },
      { name: 'resource_opened', users: c(n(48)), events: n(133) },
      { name: 'feedback_submitted', users: c(n(9)), events: n(11) },
    ],
    modes: [
      { mode: 'practice', users: c(n(198)) },
      { mode: 'daily', users: c(n(150)) },
      { mode: 'mock', users: c(n(74)) },
      { mode: 'duel', users: c(n(55)) },
      { mode: 'weak', users: c(n(41)) },
      { mode: 'area', users: c(n(33)) },
      { mode: 'redo', users: c(n(22)) },
      { mode: 'endless', users: hidden },
    ],
    practice: {
      started: { users: c(n(240)), events: n(1840) },
      completed: { users: c(n(221)), events: n(1311) },
      completion_rate: 0.712,
    },
    duels: { players: cOver(n(64), [c(n(55))]), created: n(210), completed: n(187) },
    popular_events: [
      { code: 'accounting', users: c(n(120)) },
      { code: 'marketing', users: c(n(96)) },
      { code: 'personal-finance', users: c(n(88)) },
      { code: 'business-law', users: c(n(61)) },
      { code: 'economics', users: c(n(40)) },
      { code: 'entrepreneurship', users: c(n(33)) },
      { code: 'data-science-ai', users: c(n(12)) },
      { code: 'sports-entertainment-management', users: hidden },
    ],
  };
};

const preparation = (site: Site, days: number): OwnerPreparation =>
  site === 'small'
    ? {
        days,
        events: [
          { event: 'accounting', users: c(5), attempts: 14, answered: 280, accuracy: 0.66, started: c(6), abandonment: null },
          { event: 'marketing', users: hidden, attempts: null, answered: null, accuracy: null, started: hidden, abandonment: null },
        ],
      }
    : {
        days,
        events: [
          { event: 'accounting', users: c(118), attempts: 512, answered: 10240, accuracy: 0.68, started: c(124), abandonment: 0.09 },
          { event: 'marketing', users: c(92), attempts: 377, answered: 7540, accuracy: 0.74, started: c(97), abandonment: 0.12 },
          { event: 'personal-finance', users: c(85), attempts: 301, answered: 6020, accuracy: 0.79, started: c(90), abandonment: 0.07 },
          { event: 'business-law', users: c(58), attempts: 190, answered: 3800, accuracy: 0.57, started: c(66), abandonment: 0.21 },
          { event: 'economics', users: c(39), attempts: 120, answered: 2400, accuracy: 0.63, started: c(42), abandonment: 0.15 },
          { event: 'entrepreneurship', users: c(31), attempts: 74, answered: 1480, accuracy: 0.71, started: c(33), abandonment: 0.1 },
          { event: 'data-science-ai', users: c(11), attempts: 25, answered: 500, accuracy: 0.52, started: c(14), abandonment: 0.29 },
          { event: 'healthcare-administration', users: hidden, attempts: null, answered: null, accuracy: null, started: hidden, abandonment: null },
        ],
      };

/** Made-up questions behind the fixture reports. acc-118 is keyed wrong on purpose, so the report checks out. */
const questions: Record<string, OwnerQuestion> = {
  'acc-118': {
    id: 'acc-118',
    event: 'accounting',
    area: 'Adjusting entries',
    difficulty: 2,
    question:
      'On December 31, a company owes three days of wages ($1,800) that it will pay on January 4. Which adjusting entry does it record on December 31?',
    choices: [
      'Debit Wages Payable $1,800; credit Cash $1,800',
      'Debit Wages Expense $1,800; credit Wages Payable $1,800',
      'Debit Wages Expense $1,800; credit Cash $1,800',
      'No entry until the wages are paid',
    ],
    answer: 2,
    explanation: 'Wages earned in December are an expense of December, whenever they are paid.',
  },
  'law-042': {
    id: 'law-042',
    event: 'business-law',
    area: 'Contracts',
    difficulty: 1,
    question: 'A minor signs a contract to buy a car. Which of the following best describes the contract?',
    choices: ['Void', 'Voidable by the minor', 'Voidable by the seller', 'Fully enforceable by both parties'],
    answer: 1,
    explanation: "A contract with a minor is generally voidable at the minor's choice. The adult party stays bound.",
  },
};

const content: OwnerContent = {
  events: [
    { event: 'accounting', questions: 312, areas: 9, easy: 98, medium: 151, hard: 63, terms: 140 },
    { event: 'business-law', questions: 240, areas: 8, easy: 70, medium: 120, hard: 50, terms: 118 },
    { event: 'data-science-ai', questions: 86, areas: 6, easy: 30, medium: 40, hard: 16, terms: 64 },
    { event: 'economics', questions: 205, areas: 7, easy: 61, medium: 102, hard: 42, terms: 97 },
    { event: 'marketing', questions: 268, areas: 9, easy: 80, medium: 130, hard: 58, terms: 151 },
    { event: 'personal-finance', questions: 230, areas: 8, easy: 77, medium: 110, hard: 43, terms: 120 },
  ],
  reported_questions: [
    {
      question_id: 'acc-118',
      event: 'accounting',
      area: 'Adjusting entries',
      preview: 'On December 31, a company owes three days of wages that will be paid in January. Which adjusting entry...',
      reports: 3,
      open: 2,
      last_reported_at: '2026-10-10T19:12:00Z',
    },
    {
      question_id: 'law-042',
      event: 'business-law',
      area: 'Contracts',
      preview: 'A minor signs a contract to buy a car. Which of the following best describes the contract?',
      reports: 1,
      open: 1,
      last_reported_at: '2026-10-08T15:40:00Z',
    },
    {
      question_id: 'mkt-207',
      event: 'marketing',
      area: 'Pricing',
      preview: 'A retailer sets a price of $9.99 instead of $10.00. This is an example of...',
      reports: 2,
      open: 0,
      last_reported_at: '2026-09-29T12:03:00Z',
    },
  ],
  hardest_questions: [
    { question_id: 'acc-233', event: 'accounting', area: 'Inventory', preview: 'Under LIFO in a period of rising prices, cost of goods sold is...', students: c(41), answers: 47, accuracy: 0.21 },
    { question_id: 'law-118', event: 'business-law', area: 'Agency', preview: 'An agent who exceeds their actual authority may still bind the principal when...', students: c(26), answers: 29, accuracy: 0.31 },
    { question_id: 'eco-090', event: 'economics', area: 'Elasticity', preview: 'If the price elasticity of demand is 0.4, a 10% price increase will...', students: c(19), answers: 22, accuracy: 0.36 },
    { question_id: 'pf-151', event: 'personal-finance', area: 'Credit', preview: 'Which factor has the largest weight in a FICO credit score?', students: c(33), answers: 35, accuracy: 0.43 },
  ],
  feedback_status: {},
};

/** Report n's id: a uuid like the real ones, so links into triage (?report=) work in the gallery. */
const fid = (n: number) => `0f0f0f0f-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Page paths as the app stores them: ids and tokens replaced by their route name (cleanPagePath).
let feedback: OwnerFeedbackRow[] = [
  fb('f1', 'question_issue', 'Wrong answer marked correct: B is right, the textbook says wages payable is credited.', 'new', 'high', 'maya.chen', 'Maya Chen', '2026-10-10T19:12:00Z', '/play/review/:attempt', 'acc-118', 'accounting'),
  fb('f2', 'bug', 'The timer kept running after I submitted my mock exam and showed 00:00 on the results page.', 'new', 'normal', 'jordan_p', 'Jordan Patel', '2026-10-10T16:01:00Z', '/play/run'),
  fb('f3', 'accessibility', 'The chart colours on my profile are hard to tell apart. I am colour blind (red-green).', 'triaged', 'normal', 'sam.r', 'Sam Rivera', '2026-10-09T22:30:00Z', '/me'),
  fb('f4', 'feature', 'Could vocab decks have a mode that only shows terms I got wrong last time?', 'in_progress', 'low', 'lee_ann', 'Lee-Ann Brooks', '2026-10-07T13:44:00Z', '/vocab/marketing'),
  fb('f5', 'question_issue', 'The question is unclear: it does not say if the contract was signed before or after the birthday.', 'new', 'normal', 'noah.k', 'Noah Kim', '2026-10-08T15:40:00Z', '/play/review/:attempt', 'law-042', 'business-law'),
  fb('f6', 'resource_issue', 'The study guide link in our classroom goes to a 404 page.', 'triaged', 'normal', 'priya.s', 'Priya Singh', '2026-10-06T18:20:00Z', '/chapter/classroom'),
  fb('f7', 'bug', 'Duel invite notification opened the wrong duel.', 'resolved', 'high', 'ethan.w', 'Ethan Wong', '2026-09-30T20:10:00Z', '/arena', null, null, 'Fixed on Oct 2. Thanks for the clear steps!'),
];

function fb(
  key: string,
  kind: OwnerFeedbackRow['kind'],
  message: string,
  status: FeedbackStatus,
  priority: OwnerFeedbackRow['priority'],
  username: string,
  display_name: string,
  created_at: string,
  page_path: string,
  question_id: string | null = null,
  question_event: string | null = null,
  resolution_note: string | null = null,
): OwnerFeedbackRow {
  const n = Number(key.slice(1));
  return {
    id: fid(n),
    kind,
    message,
    page_path,
    question_id,
    question_event,
    status,
    priority,
    resolution_note,
    created_at,
    updated_at: created_at,
    resolved_at: status === 'resolved' || status === 'wontfix' ? '2026-10-02T14:00:00Z' : null,
    user_id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    username,
    display_name,
  };
}

const audit: AuditRow[] = [
  a(12, '2026-10-11T13:02:00Z', 'feedback_updated', 'feedback', fid(7), { from: 'in_progress', to: 'resolved', priority: 'high', note_changed: true }, 'joseph', null),
  a(13, '2026-10-11T09:30:00Z', 'member_added', 'chapter_member', 'u-new', { chapter_id: 'c1', role: 'member' }, 'maya.chen', 'new.student'),
  a(11, '2026-10-10T21:15:00Z', 'support_email_viewed', 'user', 'u-noah', { reason: 'Student asked for help resetting their sign-in email' }, 'joseph', 'noah.k'),
  a(10, '2026-10-10T17:48:00Z', 'member_banned', 'chapter_member', 'u-x', { chapter_id: 'c1', op: 'insert', has_reason: true, via: 'owner_console', reason: 'Posted spam links in the chapter feed' }, 'joseph', 'spam.account'),
  a(9, '2026-10-09T15:30:00Z', 'chapter_role_changed', 'chapter_member', 'u-priya', { chapter_id: 'c1', from: 'member', to: 'executive' }, 'maya.chen', 'priya.s'),
  a(8, '2026-10-08T12:12:00Z', 'trainer_assigned', 'chapter_member', 'u-sam', { chapter_id: 'c1', event: 'accounting' }, 'maya.chen', 'sam.r'),
  a(7, '2026-10-05T19:40:00Z', 'member_removed', 'chapter_member', 'u-z', { chapter_id: 'c1', role: 'member' }, 'maya.chen', 'old.member'),
  a(6, '2026-10-02T10:00:00Z', 'chapter_deleted', 'chapter', 'c9', { name: 'Test Chapter', members: 1 }, 'jordan_p', null),
  a(5, '2026-09-28T09:00:00Z', 'owner_granted', 'user', 'u-joseph', {}, null, 'joseph'),
];

function a(
  id: number,
  created_at: string,
  action: string,
  target_type: string,
  target_id: string,
  detail: Record<string, unknown>,
  actor: string | null,
  targetUser: string | null,
): AuditRow {
  return {
    id,
    created_at,
    action,
    target_type,
    target_id,
    detail,
    actor_id: actor ? `actor-${actor}` : null,
    actor_username: actor,
    target_username: targetUser,
  };
}

const users: OwnerUserRow[] = [
  u('maya.chen', 'Maya Chen', 'c1', 'KCB FBLA', 'president', '2026-09-03T12:00:00Z', '2026-10-11T13:00:00Z'),
  u('priya.s', 'Priya Singh', 'c1', 'KCB FBLA', 'executive', '2026-09-05T12:00:00Z', '2026-10-10T18:00:00Z'),
  u('sam.r', 'Sam Rivera', 'c1', 'KCB FBLA', 'trainer', '2026-09-06T12:00:00Z', '2026-10-08T15:00:00Z'),
  u('maxwell.j', 'Max Johnson', 'c1', 'KCB FBLA', 'member', '2026-09-12T12:00:00Z', '2026-09-20T15:00:00Z'),
  { ...u('spam.account', 'Spam Account', null, null, null, '2026-10-09T12:00:00Z', '2026-10-10T17:00:00Z'), bans: [{ chapter_id: 'c1', chapter_name: 'KCB FBLA' }] },
];

function u(
  username: string,
  display_name: string,
  chapter_id: string | null,
  chapter_name: string | null,
  chapter_role: OwnerUserRow['chapter_role'],
  created_at: string,
  last_seen_at: string | null,
): OwnerUserRow {
  return { user_id: `user-${username}`, username, display_name, created_at, last_seen_at, chapter_id, chapter_name, chapter_role, bans: [] };
}

const OPEN: FeedbackStatus[] = ['new', 'triaged', 'in_progress'];

/** Status counts straight from the feedback rows, so Content and Feedback always agree. */
function statusCounts(rows: OwnerFeedbackRow[]): Record<FeedbackStatus, number> {
  const counts: Record<FeedbackStatus, number> = { new: 0, triaged: 0, in_progress: 0, resolved: 0, wontfix: 0 };
  for (const f of rows) counts[f.status]++;
  return counts;
}

function makeSource(site: Site): FixtureSource {
  const fbRows = () => (site === 'small' ? feedback.filter((f) => f.id === fid(1) || f.id === fid(2)) : feedback);
  return {
    fixture: FIXTURE_MARKER,
    overview: async () => overviews[site],
    growth: async (days, bucket) => growth(site, days, bucket),
    engagement: async (days) => engagement(site, days),
    preparation: async (days) => preparation(site, days),
    content: async () => ({
      ...content,
      reported_questions: site === 'small' ? content.reported_questions.slice(0, 1) : content.reported_questions,
      hardest_questions: site === 'small' ? [] : content.hardest_questions,
      feedback_status: statusCounts(fbRows()),
    }),
    question: async (id) => {
      const q = questions[id];
      if (!q) throw Object.assign(new Error('Question not found'), { code: 'P0002' });
      return q;
    },
    feedbackList: async ({ status = 'open', kind, limit = 50, offset = 0, id }) => {
      const byKind = fbRows().filter((f) => !kind || f.kind === kind);
      const rows = byKind
        .filter((f) => (status === 'all' ? true : status === 'open' ? OPEN.includes(f.status) : f.status === status))
        .filter((f) => !id || f.id === id)
        .sort(
          (x, y) =>
            ['high', 'normal', 'low'].indexOf(x.priority) - ['high', 'normal', 'low'].indexOf(y.priority) ||
            y.created_at.localeCompare(x.created_at),
        );
      return { total: rows.length, rows: rows.slice(offset, offset + limit), counts: statusCounts(byKind) };
    },
    feedbackUpdate: async (id, patch) => {
      feedback = feedback.map((f) => {
        if (f.id !== id) return f;
        const status = patch.status ?? f.status;
        const closed = status === 'resolved' || status === 'wontfix';
        return {
          ...f,
          status,
          priority: patch.priority ?? f.priority,
          resolution_note: patch.resolution_note === undefined ? f.resolution_note : patch.resolution_note || null,
          resolved_at: closed ? (f.resolved_at ?? new Date().toISOString()) : null,
          updated_at: new Date().toISOString(),
        };
      });
      const r = feedback.find((f) => f.id === id)!;
      return { id, status: r.status, priority: r.priority, resolution_note: r.resolution_note, resolved_at: r.resolved_at, updated_at: r.updated_at };
    },
    auditSearch: async ({ action, q, limit = 50, offset = 0 }) => {
      const needle = (q ?? '').toLowerCase();
      const all = site === 'small' ? audit.slice(0, 3) : audit;
      const rows = all.filter(
        (r) =>
          (!action || r.action === action) &&
          (!needle || [r.action, r.actor_username, r.target_username, JSON.stringify(r.detail)].some((s) => s?.toLowerCase().includes(needle))),
      );
      return { total: rows.length, rows: rows.slice(offset, offset + limit), actions: [...new Set(all.map((r) => r.action))] };
    },
    userSearch: async (query) => {
      const n = query.toLowerCase();
      return users.filter((x) => x.username.includes(n) || x.display_name.toLowerCase().includes(n));
    },
    supportEmail: async (userId) => `${userId.replace('user-', '').replace(/[^a-z]/g, '')}@student.example`,
    setChapterBan: async () => {},
    setChapterRole: async () => ({ changed: true }),
  };
}

export const fixtureSource: FixtureSource = makeSource('busy');
export const smallFixtureSource: FixtureSource = makeSource('small');
