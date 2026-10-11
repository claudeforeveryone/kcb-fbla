// DEV ONLY. Made-up data for the owner console in the component gallery (/dev/ui?only=owner). Imported only by
// src/components/ui/Gallery.tsx, which App.tsx loads only when import.meta.env.DEV, so none of this reaches a
// production build (the build check greps dist/ for FIXTURE_MARKER). Never use it anywhere else.
import type {
  AuditRow,
  OwnerContent,
  OwnerEngagement,
  OwnerFeedbackRow,
  OwnerOverview,
  OwnerPreparation,
  OwnerUserRow,
} from '../../api/owner';
import type { FeedbackStatus } from '../../lib/feedback';
import type { Bucket, Count, GrowthRow } from '../../lib/owner';
import type { OwnerSource } from './shared';

export const FIXTURE_MARKER = 'omega-owner-fixture-data';

const c = (value: number): Count => (value >= 1 && value <= 4 ? { value: null, suppressed: true } : { value, suppressed: false });
const hidden: Count = { value: null, suppressed: true };
const NOW = '2026-10-11T14:20:00Z';

const overview: OwnerOverview = {
  generated_at: NOW,
  timezone: 'America/Toronto',
  tracking_since: '2026-09-02T13:05:00Z',
  accounts: c(412),
  profiles: c(371),
  new_accounts: { day: hidden, week: c(38), month: c(121) },
  active: { dau: c(57), wau: c(188), mau: c(301) },
  returning: c(164),
  returning_rate: 0.545,
  onboarding: {
    month: { created: c(121), onboarded: c(104), rate: 0.86 },
    all_time: { created: c(412), onboarded: c(371), rate: 0.9 },
  },
  answered_week: { users: c(143), questions: 9874 },
};

// Deterministic wiggle so the charts look like real traffic without randomness between renders.
const wave = (i: number, base: number, amp: number) => Math.max(0, Math.round(base + amp * Math.sin(i * 0.9) + (i % 5) * (amp / 4)));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function growth(days: number, bucket: Bucket): { days: number; bucket: Bucket; timezone: string; series: GrowthRow[] } {
  const end = new Date(Date.UTC(2026, 9, 11));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const buckets: { s: Date; e: Date }[] = [];
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
    buckets.push({ s: s < start ? start : s, e: e > end ? end : e });
  }
  const scale = bucket === 'day' ? 1 : bucket === 'week' ? 6 : 24;
  let total = 412 - buckets.length * 4 * scale;
  const series = buckets.map((b, i) => {
    const signups = i % 7 === 3 && bucket === 'day' ? 2 : wave(i, 4 * scale, 2 * scale);
    total += signups;
    return {
      start: iso(b.s),
      end: iso(b.e),
      signups: c(signups),
      onboarded: c(Math.round(signups * 0.86)),
      active: c(wave(i + 2, 52 * Math.sqrt(scale) * (bucket === 'day' ? 1 : 1.6), 12)),
      practising: c(wave(i + 4, 38 * Math.sqrt(scale) * (bucket === 'day' ? 1 : 1.5), 10)),
      total: c(Math.max(5, total)),
    };
  });
  return { days, bucket, timezone: 'America/Toronto', series };
}

const engagement = (days: number): OwnerEngagement => {
  const k = days / 30;
  const n = (v: number) => Math.round(v * Math.min(k, 3));
  return {
    days,
    features: [
      { name: 'practice_started', users: c(n(240)), events: n(1840) },
      { name: 'practice_completed', users: c(n(221)), events: n(1311) },
      { name: 'exam_completed', users: c(n(74)), events: n(102) },
      { name: 'event_selected', users: c(n(266)), events: n(902) },
      { name: 'vocab_session_completed', users: c(n(131)), events: n(486) },
      { name: 'duel_started', users: c(n(64)), events: n(210) },
      { name: 'duel_completed', users: c(n(61)), events: n(187) },
      { name: 'onboarding_completed', users: c(n(104)), events: n(104) },
      { name: 'resource_opened', users: c(n(48)), events: n(133) },
      { name: 'feedback_submitted', users: c(n(9)), events: n(11) },
      { name: 'install_prompt_shown', users: c(n(37)), events: n(52) },
      { name: 'app_installed', users: hidden, events: null },
      { name: 'push_enabled', users: hidden, events: null },
    ],
    modes: [
      { mode: 'practice', users: c(n(198)), attempts: n(820) },
      { mode: 'daily', users: c(n(150)), attempts: n(611) },
      { mode: 'mock', users: c(n(74)), attempts: n(102) },
      { mode: 'weak', users: c(n(41)), attempts: n(96) },
      { mode: 'area', users: c(n(33)), attempts: n(71) },
      { mode: 'redo', users: c(n(22)), attempts: n(40) },
      { mode: 'endless', users: hidden, attempts: null },
    ],
    practice: {
      started: { users: c(n(240)), events: n(1840) },
      completed: { users: c(n(221)), events: n(1311) },
      completion_rate: 0.712,
    },
    duels: { players: c(n(64)), created: n(210), completed: n(187) },
    popular_events: [
      { code: 'accounting', users: c(n(120)), events: n(390) },
      { code: 'marketing', users: c(n(96)), events: n(301) },
      { code: 'personal-finance', users: c(n(88)), events: n(254) },
      { code: 'business-law', users: c(n(61)), events: n(170) },
      { code: 'economics', users: c(n(40)), events: n(118) },
      { code: 'entrepreneurship', users: c(n(33)), events: n(80) },
      { code: 'data-science-ai', users: c(n(12)), events: n(31) },
      { code: 'sports-entertainment-management', users: hidden, events: null },
    ],
  };
};

const preparation = (days: number): OwnerPreparation => ({
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
});

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
  feedback_status: { new: 3, triaged: 2, in_progress: 1, resolved: 7, wontfix: 1 },
};

let feedback: OwnerFeedbackRow[] = [
  fb('f1', 'question_issue', 'Wrong answer marked correct: B is right, the textbook says wages payable is credited.', 'new', 'high', 'maya.chen', 'Maya Chen', '2026-10-10T19:12:00Z', '/play/review/abc', 'acc-118', 'accounting'),
  fb('f2', 'bug', 'The timer kept running after I submitted my mock exam and showed 00:00 on the results page.', 'new', 'normal', 'jordan_p', 'Jordan Patel', '2026-10-10T16:01:00Z', '/play/run'),
  fb('f3', 'accessibility', 'The chart colours on my profile are hard to tell apart. I am colour blind (red-green).', 'triaged', 'normal', 'sam.r', 'Sam Rivera', '2026-10-09T22:30:00Z', '/me'),
  fb('f4', 'feature', 'Could vocab decks have a mode that only shows terms I got wrong last time?', 'in_progress', 'low', 'lee_ann', 'Lee-Ann Brooks', '2026-10-07T13:44:00Z', '/vocab/marketing'),
  fb('f5', 'question_issue', 'The question is unclear: it does not say if the contract was signed before or after the birthday.', 'new', 'normal', 'noah.k', 'Noah Kim', '2026-10-08T15:40:00Z', '/play/review/def', 'law-042', 'business-law'),
  fb('f6', 'resource_issue', 'The study guide link in our classroom goes to a 404 page.', 'triaged', 'normal', 'priya.s', 'Priya Singh', '2026-10-06T18:20:00Z', '/chapter/classroom'),
  fb('f7', 'bug', 'Duel invite notification opened the wrong duel.', 'resolved', 'high', 'ethan.w', 'Ethan Wong', '2026-09-30T20:10:00Z', '/arena', null, null, 'Fixed on Oct 2. Thanks for the clear steps!'),
];

function fb(
  id: string,
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
  return {
    id,
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
    user_id: `00000000-0000-4000-8000-0000000000${id.slice(1).padStart(2, '0')}`,
    username,
    display_name,
  };
}

const audit: AuditRow[] = [
  a(12, '2026-10-11T13:02:00Z', 'feedback_updated', 'feedback', 'f7', { from: 'in_progress', to: 'resolved', priority: 'high', note_changed: true }, 'joseph', null),
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

export const fixtureSource: OwnerSource = {
  overview: async () => overview,
  growth: async (days, bucket) => growth(days, bucket),
  engagement: async (days) => engagement(days),
  preparation: async (days) => preparation(days),
  content: async () => content,
  feedbackList: async ({ status = 'open', kind, limit = 50, offset = 0 }) => {
    const byKind = feedback.filter((f) => !kind || f.kind === kind);
    const rows = byKind
      .filter((f) => (status === 'all' ? true : status === 'open' ? OPEN.includes(f.status) : f.status === status))
      .sort((x, y) => ['high', 'normal', 'low'].indexOf(x.priority) - ['high', 'normal', 'low'].indexOf(y.priority) || y.created_at.localeCompare(x.created_at));
    const counts = { new: 0, triaged: 0, in_progress: 0, resolved: 0, wontfix: 0 } as Record<FeedbackStatus, number>;
    for (const f of byKind) counts[f.status]++;
    return { total: rows.length, rows: rows.slice(offset, offset + limit), counts };
  },
  feedbackUpdate: async (id, patch) => {
    feedback = feedback.map((f) =>
      f.id === id
        ? {
            ...f,
            status: patch.status ?? f.status,
            priority: patch.priority ?? f.priority,
            resolution_note: patch.resolution_note === undefined ? f.resolution_note : patch.resolution_note || null,
            updated_at: new Date().toISOString(),
          }
        : f,
    );
    const r = feedback.find((f) => f.id === id)!;
    return { id, status: r.status, priority: r.priority, resolution_note: r.resolution_note, resolved_at: r.resolved_at, updated_at: r.updated_at };
  },
  auditSearch: async ({ action, q, limit = 50, offset = 0 }) => {
    const needle = (q ?? '').toLowerCase();
    const rows = audit.filter(
      (r) =>
        (!action || r.action === action) &&
        (!needle || [r.action, r.actor_username, r.target_username, JSON.stringify(r.detail)].some((s) => s?.toLowerCase().includes(needle))),
    );
    return { total: rows.length, rows: rows.slice(offset, offset + limit), actions: [...new Set(audit.map((r) => r.action))] };
  },
  userSearch: async (query) => {
    const n = query.toLowerCase();
    return users.filter((x) => x.username.includes(n) || x.display_name.toLowerCase().includes(n));
  },
  supportEmail: async (userId) => `${userId.replace('user-', '').replace(/[^a-z]/g, '')}@student.example`,
  setChapterBan: async () => {},
  setChapterRole: async () => ({ changed: true }),
};
