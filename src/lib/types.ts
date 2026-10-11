// Shared types for the FBLC database (supabase/migrations/0006..0009) and the static event catalogue.
// Rows mirror public.fbla_* exactly; RPC results mirror the core functions in 0007_core_rpcs.sql.

// ------------------------------------------------------------------------------------------------ events

export type EventGroup = 'objective' | 'case';

export type EventSlug =
  | 'accounting'
  | 'business-law'
  | 'data-science-ai'
  | 'personal-finance'
  | 'securities-investments'
  | 'organizational-leadership'
  | 'intro-business-concepts'
  | 'healthcare-administration'
  | 'economics'
  | 'business-management'
  | 'marketing'
  | 'international-business'
  | 'sports-entertainment-management'
  | 'entrepreneurship'
  | 'hospitality-event-management';

export type EventInfo = {
  slug: EventSlug;
  name: string;
  /** Short label for chips and tight table cells. */
  short: string;
  group: EventGroup;
  /** New for the 2026-27 season. */
  isNew: boolean;
  /** Eligibility note, shown under the name when present. */
  gradeNote: string | null;
  /** Prefix of the event's official question ids (acc-001 ...). */
  prefix: string;
};

/** Every event, in the order the chapter lists them (objective tests first). */
export const EVENTS: readonly EventInfo[] = [
  { slug: 'accounting', name: 'Accounting', short: 'ACCT', group: 'objective', isNew: false, gradeNote: null, prefix: 'acc' },
  { slug: 'business-law', name: 'Business Law', short: 'LAW', group: 'objective', isNew: false, gradeNote: null, prefix: 'law' },
  { slug: 'data-science-ai', name: 'Data Science & AI', short: 'DSAI', group: 'objective', isNew: true, gradeNote: null, prefix: 'dsa' },
  { slug: 'personal-finance', name: 'Personal Finance', short: 'PFIN', group: 'objective', isNew: false, gradeNote: null, prefix: 'pf' },
  { slug: 'securities-investments', name: 'Securities & Investments', short: 'SEC', group: 'objective', isNew: false, gradeNote: null, prefix: 'sec' },
  { slug: 'organizational-leadership', name: 'Organizational Leadership', short: 'ORGL', group: 'objective', isNew: false, gradeNote: null, prefix: 'ol' },
  { slug: 'intro-business-concepts', name: 'Introduction to Business Concepts', short: 'IBC', group: 'objective', isNew: false, gradeNote: 'Grades 9 and 10 only', prefix: 'ibc' },
  { slug: 'healthcare-administration', name: 'Healthcare Administration', short: 'HCA', group: 'objective', isNew: false, gradeNote: null, prefix: 'hca' },
  { slug: 'economics', name: 'Economics', short: 'ECON', group: 'objective', isNew: false, gradeNote: null, prefix: 'eco' },
  { slug: 'business-management', name: 'Business Management', short: 'BMGT', group: 'case', isNew: false, gradeNote: null, prefix: 'bm' },
  { slug: 'marketing', name: 'Marketing', short: 'MKT', group: 'case', isNew: false, gradeNote: null, prefix: 'mkt' },
  { slug: 'international-business', name: 'International Business', short: 'INTB', group: 'case', isNew: false, gradeNote: null, prefix: 'ib' },
  { slug: 'sports-entertainment-management', name: 'Sports & Entertainment Management', short: 'SEM', group: 'case', isNew: true, gradeNote: null, prefix: 'sem' },
  { slug: 'entrepreneurship', name: 'Entrepreneurship', short: 'ENTR', group: 'case', isNew: false, gradeNote: null, prefix: 'ent' },
  { slug: 'hospitality-event-management', name: 'Hospitality & Event Management', short: 'HEM', group: 'case', isNew: false, gradeNote: null, prefix: 'hem' },
];

export const EVENT_GROUPS: readonly { id: EventGroup; label: string; blurb: string }[] = [
  { id: 'objective', label: 'Objective Test Events', blurb: '100 questions, 50 minutes at competition' },
  { id: 'case', label: 'Case Study Events', blurb: 'The knowledge behind the case' },
];

const EVENT_BY_SLUG = new Map<string, EventInfo>(EVENTS.map((e) => [e.slug, e]));
const EVENT_BY_PREFIX = new Map<string, EventInfo>(EVENTS.map((e) => [e.prefix, e]));

export function isEventSlug(s: string | null | undefined): s is EventSlug {
  return s != null && EVENT_BY_SLUG.has(s);
}
export function eventInfo(slug: string | null | undefined): EventInfo | undefined {
  return slug ? EVENT_BY_SLUG.get(slug) : undefined;
}
/** Display name for a slug; falls back to the slug itself (or "Mixed" for null). */
export function eventName(slug: string | null | undefined): string {
  if (!slug) return 'Mixed';
  return EVENT_BY_SLUG.get(slug)?.name ?? slug;
}
/** Event of an official question id such as "acc-042"; undefined for custom ids. */
export function eventOfQuestion(questionId: string): EventInfo | undefined {
  return EVENT_BY_PREFIX.get(questionId.split('-')[0]);
}

// ------------------------------------------------------------------------------------------------ enums

export type ChapterRole = 'president' | 'executive' | 'trainer' | 'member';
export const ROLE_LABELS: Record<ChapterRole, string> = {
  president: 'President',
  executive: 'Executive',
  trainer: 'Trainer',
  member: 'Member',
};
export const ROLE_RANK: Record<ChapterRole, number> = { president: 3, executive: 2, trainer: 1, member: 0 };
export const isAdminRole = (r: ChapterRole | null | undefined) => r === 'president' || r === 'executive';

export type AttemptKind =
  | 'practice'
  | 'daily'
  | 'endless'
  | 'weak'
  | 'mock'
  | 'area'
  | 'custom'
  | 'assignment'
  | 'duel'
  | 'redo';
export const ATTEMPT_KIND_LABELS: Record<AttemptKind, string> = {
  practice: 'Practice',
  daily: 'Daily challenge',
  endless: 'Endless',
  weak: 'Weak spots',
  mock: 'Mock exam',
  area: 'Area drill',
  custom: 'Chapter test',
  assignment: 'Assignment',
  duel: 'Arena duel',
  redo: 'Redo missed',
};
/** Kinds that never change Elo (mirrors fbla_submit_attempt). */
export const NO_ELO_KINDS: readonly AttemptKind[] = ['custom', 'duel'];

export type Difficulty = 1 | 2 | 3;
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export type DuelStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'complete';
export type FriendStatus = 'pending' | 'accepted';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type PostKind = 'announcement' | 'link' | 'newsletter' | 'resource';
export type AssignmentKind = 'test' | 'deck' | 'official';
export type CustomTestSource = 'custom' | 'copied';

// ------------------------------------------------------------------------------------------------ rows

/** public.fbla_profiles. Readable by every signed-in user. */
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  school: string | null;
  grade: number | null;
  main_event: string | null;
  bio: string | null;
  chapter_id: string | null;
  elo: number;
  peak_elo: number;
  questions_answered: number;
  questions_correct: number;
  time_spent_ms: number;
  current_streak: number;
  best_streak: number;
  /** Current run of consecutive correct answers (across attempts). */
  answer_streak: number;
  best_answer_streak: number;
  last_active_date: string | null;
  duel_wins: number;
  duel_losses: number;
  duel_draws: number;
  /** Only present on your own profile (fbla_my_profile); other members' opt-in is private. */
  email_opt_in?: boolean;
  last_seen_at: string | null;
  created_at: string;
};

/** Every fbla_profiles column a client may select (email_opt_in is owner-only: read it with fbla_my_profile). */
export const PROFILE_COLUMNS =
  'id,username,display_name,avatar_url,school,grade,main_event,bio,chapter_id,elo,peak_elo,questions_answered,' +
  'questions_correct,time_spent_ms,current_streak,best_streak,answer_streak,best_answer_streak,last_active_date,' +
  'duel_wins,duel_losses,duel_draws,last_seen_at,created_at';

/** The only columns a member may update directly (column grants enforce the same list). */
export const PROFILE_EDITABLE = [
  'display_name',
  'avatar_url',
  'school',
  'grade',
  'main_event',
  'bio',
  'email_opt_in',
  'username',
  'last_seen_at',
] as const;
export type ProfilePatch = Partial<Pick<Profile, (typeof PROFILE_EDITABLE)[number]>>;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Small public card used in lists (leaderboards, members, duels). */
export type ProfileCard = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'school' | 'grade' | 'elo' | 'main_event' | 'chapter_id'
>;
export const PROFILE_CARD_COLUMNS = 'id,username,display_name,avatar_url,school,grade,elo,main_event,chapter_id';

/**
 * public.fbla_chapters as clients can read it. join_code and invite_token are hidden: admins read them with
 * fbla_chapter_invite(). Always select CHAPTER_COLUMNS, never '*'.
 */
export type Chapter = {
  id: string;
  name: string;
  school: string | null;
  region: string | null;
  description: string | null;
  president_id: string | null;
  created_at: string;
};
export const CHAPTER_COLUMNS = 'id,name,school,region,description,president_id,created_at';
export type ChapterInvite = { join_code: string; invite_token: string };

export type ChapterMember = {
  chapter_id: string;
  user_id: string;
  role: ChapterRole;
  joined_at: string;
};

export type ChapterBan = {
  chapter_id: string;
  user_id: string;
  banned_by: string | null;
  reason: string | null;
  created_at: string;
};

export type Trainer = { chapter_id: string; user_id: string; event: EventSlug; created_at: string };

/** public.fbla_questions (server copy of content/*.json used for grading). */
export type QuestionRow = {
  id: string;
  event: EventSlug;
  sub: string;
  diff: Difficulty;
  q: string;
  choices: string[];
  answer: number;
  explain: string | null;
};

export type Attempt = {
  id: string;
  user_id: string;
  kind: AttemptKind;
  event: string | null;
  label: string | null;
  total: number;
  correct: number;
  duration_ms: number;
  elo_before: number;
  elo_after: number;
  custom_test_id: string | null;
  assignment_id: string | null;
  duel_id: string | null;
  created_at: string;
};

export type AnswerRow = {
  id: number;
  attempt_id: string;
  user_id: string;
  /** Official id ("acc-001") or "custom:<testId>:<n>" with n the 0-based index into the test's questions. */
  question_id: string;
  event: string | null;
  sub: string | null;
  diff: Difficulty | null;
  chosen: number | null;
  correct: boolean;
  ms: number;
  elo_delta: number;
  created_at: string;
};

export type VocabProgress = {
  user_id: string;
  term_id: string;
  /** Leitner box 0-5; 4+ counts as mastered (vocab_100 achievement). */
  box: number;
  due_at: string;
  correct_count: number;
  wrong_count: number;
  last_reviewed_at: string | null;
};
export const VOCAB_MASTERED_BOX = 4;

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type AchievementRow = { user_id: string; code: AchievementCode; earned_at: string };

export type Duel = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  event: string;
  question_ids: string[];
  status: DuelStatus;
  challenger_score: number | null;
  challenger_ms: number | null;
  opponent_score: number | null;
  opponent_ms: number | null;
  winner_id: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  expires_at: string;
};

export type Friend = { user_id: string; friend_id: string; status: FriendStatus; created_at: string };

export type AttendanceSession = {
  id: string;
  chapter_id: string;
  title: string;
  held_on: string;
  created_by: string | null;
  created_at: string;
};
export type Attendance = { session_id: string; user_id: string; status: AttendanceStatus };

export type Post = {
  id: string;
  chapter_id: string;
  author_id: string | null;
  kind: PostKind;
  event: string | null;
  title: string;
  body: string | null;
  url: string | null;
  pinned: boolean;
  created_at: string;
};

export type CustomQuestion = {
  q: string;
  choices: [string, string, string, string] | string[];
  answer: number;
  explain?: string | null;
  sub?: string | null;
};
export type CustomTest = {
  id: string;
  chapter_id: string;
  author_id: string | null;
  event: string | null;
  title: string;
  description: string | null;
  time_limit_sec: number | null;
  shuffle: boolean;
  questions: CustomQuestion[];
  source: CustomTestSource;
  created_at: string;
  updated_at: string;
};
/** Question id the server grades a custom test question by. */
export const customQuestionId = (testId: string, index: number) => `custom:${testId}:${index}`;
export function parseCustomQuestionId(id: string): { testId: string; index: number } | null {
  const m = /^custom:([^:]+):(\d+)$/.exec(id);
  return m ? { testId: m[1], index: Number(m[2]) } : null;
}

export type DeckCard = { term: string; def: string };
export type Deck = {
  id: string;
  chapter_id: string;
  author_id: string | null;
  event: string | null;
  title: string;
  cards: DeckCard[];
  created_at: string;
};

export type Assignment = {
  id: string;
  chapter_id: string;
  kind: AssignmentKind;
  /** custom test id, deck id, or event slug (official). */
  ref: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  assigned_by: string | null;
  event: string | null;
  created_at: string;
};

// ------------------------------------------------------------------------------------------------ RPCs

export type SubmitAnswer = { question_id: string; chosen: number | null; ms: number };
export type SubmitAttemptInput = {
  kind: AttemptKind;
  event?: string | null;
  label?: string | null;
  custom_test_id?: string | null;
  assignment_id?: string | null;
  duel_id?: string | null;
  /** Wall-clock time for the whole run; defaults to the sum of answer times. */
  duration_ms?: number;
  answers: SubmitAnswer[];
};
export type GradedAnswer = {
  question_id: string;
  correct: boolean;
  chosen: number | null;
  correct_choice: number;
  elo_delta: number;
  explain: string | null;
};
export type SubmitAttemptResult = {
  attempt_id: string;
  correct: number;
  total: number;
  duration_ms: number;
  elo_before: number;
  elo_after: number;
  answers: GradedAnswer[];
  /** Codes newly earned by this submission. */
  achievements: AchievementCode[];
  current_streak: number;
};

export type PlayerLeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  school: string | null;
  grade: number | null;
  main_event: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  /** Overall Elo, or Elo earned in p_event when filtering by event. */
  elo: number;
  peak_elo: number;
  questions_answered: number;
  questions_correct: number;
  /** 0..1 */
  accuracy: number;
  current_streak: number;
  is_me: boolean;
  /** Rows in the whole (unpaged) ranking. */
  total_count: number;
};

export type ChapterLeaderboardRow = {
  rank: number;
  chapter_id: string;
  name: string;
  school: string | null;
  region: string | null;
  member_count: number;
  total_elo: number;
  avg_elo: number;
  questions_answered: number;
  top_user_id: string | null;
  top_username: string | null;
  top_display_name: string | null;
  top_avatar_url: string | null;
  top_elo: number | null;
  is_mine: boolean;
  total_count: number;
};

export type WeakSpot = {
  event: string;
  sub: string;
  answered: number;
  correct: number;
  /** 0..1, worst first */
  accuracy: number;
  attempts: number;
  last_answered_at: string;
};

export type EventStat = { event: string; answered: number; correct: number; accuracy: number; elo: number };
export type SubStat = { event: string; sub: string; answered: number; correct: number; accuracy: number };
export type ProfileStats = {
  /** email_opt_in is omitted for other people's profiles. */
  profile: Profile;
  chapter: { id: string; name: string; role: ChapterRole } | null;
  rank: number;
  players: number;
  questions_answered: number;
  questions_correct: number;
  accuracy: number;
  time_spent_ms: number;
  /** 0 if the member hasn't practised today or yesterday. */
  current_streak: number;
  best_streak: number;
  best_answer_streak: number;
  attempts_count: number;
  by_event: EventStat[];
  /** null unless the viewer is the member or chapter staff. */
  by_sub: SubStat[] | null;
  best_paper: {
    attempt_id: string;
    kind: AttemptKind;
    event: string | null;
    label: string | null;
    correct: number;
    total: number;
    accuracy: number;
    created_at: string;
  } | null;
  /** Last rating of each day (America/Toronto), past 365 days, oldest first. */
  elo_history: { date: string; elo: number }[];
  /** Answers per day, past 182 days, oldest first (days with none are omitted). */
  activity: { date: string; answered: number }[];
  achievements: { code: AchievementCode; earned_at: string }[];
  /** null unless the viewer is the member or chapter staff. */
  recent_attempts:
    | Pick<Attempt, 'id' | 'kind' | 'event' | 'label' | 'total' | 'correct' | 'duration_ms' | 'elo_before' | 'elo_after' | 'created_at'>[]
    | null;
  can_view_private: boolean;
};

export type ChapterPreview = {
  id: string;
  name: string;
  school: string | null;
  region: string | null;
  description: string | null;
  member_count: number;
  president_name: string | null;
  is_banned: boolean;
  already_member: boolean;
};

// ------------------------------------------------------------------------------------------------ achievements

export type AchievementCode =
  | 'first_steps'
  | 'questions_100'
  | 'questions_500'
  | 'questions_1000'
  | 'perfect_paper'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'answer_streak_10'
  | 'answer_streak_25'
  | 'elo_300'
  | 'elo_500'
  | 'elo_700'
  | 'duel_win_1'
  | 'duel_win_10'
  | 'all_events'
  | 'mock_90'
  | 'speed_run'
  | 'chapter_joined'
  | 'vocab_100';

export type AchievementDef = {
  code: AchievementCode;
  title: string;
  description: string;
  /** lucide-react component name. */
  icon: string;
  /** Loose grouping for the trophy case. */
  category: 'practice' | 'streaks' | 'rating' | 'arena' | 'chapter' | 'vocab';
};

/** Mirrors public.fbla_achievement_defs (0007_core_rpcs.sql), in display order. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: 'first_steps', title: 'First Steps', description: 'Finish your first practice set.', icon: 'Footprints', category: 'practice' },
  { code: 'questions_100', title: 'Century', description: 'Answer 100 questions.', icon: 'Target', category: 'practice' },
  { code: 'questions_500', title: 'Five Hundred Club', description: 'Answer 500 questions.', icon: 'Layers', category: 'practice' },
  { code: 'questions_1000', title: 'Thousand Strong', description: 'Answer 1,000 questions.', icon: 'Mountain', category: 'practice' },
  { code: 'perfect_paper', title: 'Perfect Paper', description: 'Score 100% on a set of 10 or more questions.', icon: 'BadgeCheck', category: 'practice' },
  { code: 'streak_3', title: 'On a Roll', description: 'Practise 3 days in a row.', icon: 'Flame', category: 'streaks' },
  { code: 'streak_7', title: 'Week Warrior', description: 'Practise 7 days in a row.', icon: 'CalendarCheck', category: 'streaks' },
  { code: 'streak_30', title: 'Unstoppable', description: 'Practise 30 days in a row.', icon: 'Crown', category: 'streaks' },
  { code: 'answer_streak_10', title: 'Hot Hand', description: 'Get 10 answers right in a row.', icon: 'Zap', category: 'streaks' },
  { code: 'answer_streak_25', title: 'In the Zone', description: 'Get 25 answers right in a row.', icon: 'Sparkles', category: 'streaks' },
  { code: 'elo_300', title: 'Rising Star', description: 'Reach 300 Elo.', icon: 'Star', category: 'rating' },
  { code: 'elo_500', title: 'Contender', description: 'Reach 500 Elo.', icon: 'TrendingUp', category: 'rating' },
  { code: 'elo_700', title: 'Elite', description: 'Reach 700 Elo.', icon: 'Gem', category: 'rating' },
  { code: 'duel_win_1', title: 'Duelist', description: 'Win your first Arena duel.', icon: 'Swords', category: 'arena' },
  { code: 'duel_win_10', title: 'Arena Champion', description: 'Win 10 Arena duels.', icon: 'Trophy', category: 'arena' },
  { code: 'all_events', title: 'Explorer', description: 'Answer questions in every event.', icon: 'Compass', category: 'practice' },
  { code: 'mock_90', title: 'Competition Ready', description: 'Score 90% or higher on a mock exam.', icon: 'GraduationCap', category: 'practice' },
  { code: 'speed_run', title: 'Quick Draw', description: 'Average under 15 seconds a question on 20+ questions with 80% right.', icon: 'Timer', category: 'practice' },
  { code: 'chapter_joined', title: 'Team Player', description: 'Join a chapter.', icon: 'Users', category: 'chapter' },
  { code: 'vocab_100', title: 'Word Smith', description: 'Master 100 vocab terms.', icon: 'BookOpen', category: 'vocab' },
];

const ACHIEVEMENT_BY_CODE = new Map<string, AchievementDef>(ACHIEVEMENTS.map((a) => [a.code, a]));
export function achievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_CODE.get(code);
}
