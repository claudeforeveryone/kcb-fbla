// Chapter classroom: posts (announcements, links, resources, newsletters), custom tests, flashcard decks and
// assignments. Permissions live in RLS (supabase/migrations/0013_classroom.sql); the helpers here only mirror them
// so the UI can hide what the server would refuse.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ApiError, toApiError } from './core';
import {
  CHAPTER_COLUMNS,
  customQuestionId,
  isAdminRole,
  type Assignment,
  type AssignmentKind,
  type Attempt,
  type Chapter,
  type ChapterRole,
  type CustomQuestion,
  type CustomTest,
  type Deck,
  type DeckCard,
  type EventSlug,
  type Post,
  type PostKind,
} from '../lib/types';

function must<T>(res: { data: T | null; error: PostgrestError | null }, fallback?: string): T {
  if (res.error) throw toApiError(res.error, fallback);
  return res.data as T;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError('You are signed out. Sign in and try again.', '42501');
  return id;
}

// ------------------------------------------------------------------------------------------------ rows (0013 columns)

export type ClassPost = Post & {
  updated_at: string;
  author: PersonLite | null;
};
export type ClassTest = CustomTest & { published: boolean };
export type ClassDeck = Deck & { updated_at: string };
export type ClassAssignment = Assignment & { options: { paper?: 'A' | 'B' | 'full' } };

export type PersonLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};
const PERSON = 'id,username,display_name,avatar_url';

// ------------------------------------------------------------------------------------------------ context

export type ClassMember = {
  user_id: string;
  role: ChapterRole;
  joined_at: string;
  profile: PersonLite & { elo: number; main_event: string | null };
};

export type ClassroomContext = {
  chapter: Chapter;
  me: { id: string; role: ChapterRole };
  /** Events the caller trains (empty unless trainer). */
  trainerEvents: EventSlug[];
  members: ClassMember[];
};

/** The caller's chapter, role, trainer events and the roster. Null when not in a chapter. */
export async function loadClassroomContext(): Promise<ClassroomContext | null> {
  const me = await uid();
  const mem = must(
    await supabase
      .from('fbla_chapter_members')
      .select('chapter_id,role')
      .eq('user_id', me)
      .maybeSingle<{ chapter_id: string; role: ChapterRole }>(),
  );
  if (!mem) return null;
  const [chapter, trainers, roster] = await Promise.all([
    supabase.from('fbla_chapters').select(CHAPTER_COLUMNS).eq('id', mem.chapter_id).single<Chapter>(),
    supabase.from('fbla_trainers').select('event').eq('chapter_id', mem.chapter_id).eq('user_id', me),
    supabase
      .from('fbla_chapter_members')
      .select(`user_id,role,joined_at,profile:fbla_profiles(${PERSON},elo,main_event)`)
      .eq('chapter_id', mem.chapter_id),
  ]);
  return {
    chapter: must(chapter),
    me: { id: me, role: mem.role },
    trainerEvents: (must(trainers) ?? []).map((t: { event: string }) => t.event as EventSlug),
    members: ((must(roster) ?? []) as unknown as ClassMember[])
      .filter((m) => m.profile)
      .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name)),
  };
}

export const isStaff = (ctx: ClassroomContext) => isAdminRole(ctx.me.role) || ctx.trainerEvents.length > 0;
export const isAdmin = (ctx: ClassroomContext) => isAdminRole(ctx.me.role);
/** Mirrors fbla_can_manage: admins for anything, trainers only for their (non-null) events. */
export function canManage(ctx: ClassroomContext, event: string | null | undefined): boolean {
  if (isAdminRole(ctx.me.role)) return true;
  return !!event && ctx.trainerEvents.includes(event as EventSlug);
}
export const canWriteNewsletter = (ctx: ClassroomContext) => isAdminRole(ctx.me.role);
export function canEditPost(ctx: ClassroomContext, p: Post): boolean {
  if (isAdminRole(ctx.me.role)) return true;
  if (p.kind === 'newsletter') return false;
  return p.author_id === ctx.me.id && canManage(ctx, p.event);
}
export function canDeletePost(ctx: ClassroomContext, p: Post): boolean {
  return isAdminRole(ctx.me.role) || p.author_id === ctx.me.id;
}

// ------------------------------------------------------------------------------------------------ posts

export const POST_KINDS: readonly PostKind[] = ['announcement', 'newsletter', 'link', 'resource'];

export async function listPosts(chapterId: string): Promise<ClassPost[]> {
  const res = await supabase
    .from('fbla_posts')
    .select(`*,author:fbla_profiles(${PERSON})`)
    .eq('chapter_id', chapterId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);
  return (must(res) ?? []) as unknown as ClassPost[];
}

export type PostInput = {
  kind: PostKind;
  title: string;
  body?: string | null;
  url?: string | null;
  event?: string | null;
  pinned?: boolean;
};

function cleanPost(p: PostInput) {
  return {
    kind: p.kind,
    title: p.title.trim(),
    body: p.body?.trim() || null,
    url: normaliseUrl(p.url),
    event: p.event || null,
    ...(p.pinned != null ? { pinned: p.pinned } : {}),
  };
}

/** Adds https:// to bare domains; empty becomes null. */
export function normaliseUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export async function createPost(chapterId: string, input: PostInput): Promise<ClassPost> {
  const res = await supabase
    .from('fbla_posts')
    .insert({ chapter_id: chapterId, ...cleanPost(input) })
    .select(`*,author:fbla_profiles(${PERSON})`)
    .single();
  return must(res, 'Could not publish the post.') as unknown as ClassPost;
}

export async function updatePost(id: string, input: PostInput): Promise<ClassPost> {
  const res = await supabase
    .from('fbla_posts')
    .update(cleanPost(input))
    .eq('id', id)
    .select(`*,author:fbla_profiles(${PERSON})`)
    .single();
  return must(res, 'Could not save the post.') as unknown as ClassPost;
}

export async function setPostPinned(id: string, pinned: boolean): Promise<void> {
  const res = await supabase.from('fbla_posts').update({ pinned }).eq('id', id).select('id');
  if (!must(res)?.length) throw new ApiError("You don't have permission to do that.", '42501');
}

export async function deletePost(id: string): Promise<void> {
  must(await supabase.from('fbla_posts').delete().eq('id', id), 'Could not delete the post.');
}

// ------------------------------------------------------------------------------------------------ custom tests

export const MAX_TEST_QUESTIONS = 200;

/**
 * Tests in a chapter, newest edit first. Read through fbla_custom_tests_view (0017): members get published tests
 * with the answer keys stripped; the people who manage a test (can_manage) get it whole, drafts included.
 */
export async function listCustomTests(chapterId: string): Promise<ClassTest[]> {
  const res = await supabase.rpc('fbla_custom_tests_view', { p_chapter: chapterId, p_ids: null });
  return (must(res as { data: ClassTest[] | null; error: PostgrestError | null }) ?? []) as ClassTest[];
}

/** One custom test. Keys (answer / explain) are only included when you can manage it. */
export async function getCustomTest(id: string): Promise<ClassTest | null> {
  const res = await supabase.rpc('fbla_custom_tests_view', { p_chapter: null, p_ids: [id] });
  return ((must(res as { data: ClassTest[] | null; error: PostgrestError | null }) ?? []) as ClassTest[])[0] ?? null;
}

/** A custom test's questions in runner shape, with the ids the server grades by (`custom:<testId>:<n>`). */
export function customTestQuestions(test: Pick<CustomTest, 'id' | 'event' | 'questions'>) {
  return test.questions.map((q, i) => ({
    id: customQuestionId(test.id, i),
    q: q.q,
    choices: [...q.choices],
    answer: q.answer,
    explain: q.explain ?? '',
    sub: q.sub ?? '',
    topic: test.event ?? '',
  }));
}

export async function createCustomTest(
  chapterId: string,
  input: { title: string; event: string | null; description?: string | null; questions?: CustomQuestion[]; source?: 'custom' | 'copied' },
): Promise<ClassTest> {
  const res = await supabase
    .from('fbla_custom_tests')
    .insert({
      chapter_id: chapterId,
      title: input.title.trim(),
      event: input.event || null,
      description: input.description?.trim() || null,
      questions: input.questions ?? [],
      source: input.source ?? 'custom',
      shuffle: true,
      published: false,
    })
    .select('*')
    .single();
  return must(res, 'Could not create the test.') as ClassTest;
}

export type TestPatch = Partial<
  Pick<ClassTest, 'title' | 'description' | 'time_limit_sec' | 'shuffle' | 'questions' | 'source' | 'published' | 'event'>
>;

export async function saveCustomTest(id: string, patch: TestPatch): Promise<ClassTest> {
  const res = await supabase.from('fbla_custom_tests').update(patch).eq('id', id).select('*').maybeSingle();
  const row = must(res, 'Could not save the test.') as ClassTest | null;
  if (!row) throw new ApiError("You can't edit this test.", '42501');
  return row;
}

export async function deleteCustomTest(id: string): Promise<void> {
  must(await supabase.from('fbla_custom_tests').delete().eq('id', id), 'Could not delete the test.');
}

export async function duplicateCustomTest(test: ClassTest): Promise<ClassTest> {
  const res = await supabase
    .from('fbla_custom_tests')
    .insert({
      chapter_id: test.chapter_id,
      title: `${test.title} (copy)`.slice(0, 120),
      event: test.event,
      description: test.description,
      time_limit_sec: test.time_limit_sec,
      shuffle: test.shuffle,
      questions: test.questions,
      source: test.source,
      published: false,
    })
    .select('*')
    .single();
  return must(res, 'Could not copy the test.') as ClassTest;
}

/** /play/run link that runs a custom test (RunPage loads it with getCustomTest). */
export const customTestHref = (testId: string) => `/play/run?mode=custom&test=${encodeURIComponent(testId)}`;

// ------------------------------------------------------------------------------------------------ decks

export async function listDecks(chapterId: string): Promise<ClassDeck[]> {
  const res = await supabase
    .from('fbla_decks')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('updated_at', { ascending: false })
    .limit(200);
  return (must(res) ?? []) as ClassDeck[];
}

export async function getDeck(id: string): Promise<ClassDeck | null> {
  return must(await supabase.from('fbla_decks').select('*').eq('id', id).maybeSingle()) as ClassDeck | null;
}

export async function createDeck(chapterId: string, input: { title: string; event: string | null; cards: DeckCard[] }): Promise<ClassDeck> {
  const res = await supabase
    .from('fbla_decks')
    .insert({ chapter_id: chapterId, title: input.title.trim(), event: input.event || null, cards: cleanCards(input.cards) })
    .select('*')
    .single();
  return must(res, 'Could not create the deck.') as ClassDeck;
}

export async function updateDeck(id: string, input: { title: string; event: string | null; cards: DeckCard[] }): Promise<ClassDeck> {
  const res = await supabase
    .from('fbla_decks')
    .update({ title: input.title.trim(), event: input.event || null, cards: cleanCards(input.cards) })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  const row = must(res, 'Could not save the deck.') as ClassDeck | null;
  if (!row) throw new ApiError("You can't edit this deck.", '42501');
  return row;
}

export async function deleteDeck(id: string): Promise<void> {
  must(await supabase.from('fbla_decks').delete().eq('id', id), 'Could not delete the deck.');
}

const cleanCards = (cards: DeckCard[]) =>
  cards.map((c) => ({ term: c.term.trim(), def: c.def.trim() })).filter((c) => c.term && c.def);

/**
 * Parses pasted cards: one per line, term and definition split by a tab, " - ", " – ", ":" or ",".
 * Lines that don't split are skipped.
 */
export function parseCardText(text: string): DeckCard[] {
  const out: DeckCard[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)(?:\t+|\s+[-–—]\s+|\s*:\s+|\s*,\s+)(.+)$/.exec(line);
    if (m) out.push({ term: m[1].trim(), def: m[2].trim() });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ assignments

export async function listAssignments(chapterId: string): Promise<ClassAssignment[]> {
  const res = await supabase
    .from('fbla_assignments')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false })
    .limit(300);
  return (must(res) ?? []) as ClassAssignment[];
}

export type AssignmentInput = {
  kind: AssignmentKind;
  ref: string;
  title: string;
  instructions?: string | null;
  due_at?: string | null;
};

export async function createAssignment(chapterId: string, input: AssignmentInput): Promise<ClassAssignment> {
  const res = await supabase
    .from('fbla_assignments')
    .insert({
      chapter_id: chapterId,
      kind: input.kind,
      ref: input.ref,
      title: input.title.trim(),
      instructions: input.instructions?.trim() || null,
      due_at: input.due_at || null,
    })
    .select('*')
    .single();
  return must(res, 'Could not create the assignment.') as ClassAssignment;
}

export async function updateAssignment(
  id: string,
  patch: Partial<Pick<Assignment, 'title' | 'instructions' | 'due_at'>>,
): Promise<ClassAssignment> {
  const res = await supabase.from('fbla_assignments').update(patch).eq('id', id).select('*').maybeSingle();
  const row = must(res, 'Could not save the assignment.') as ClassAssignment | null;
  if (!row) throw new ApiError("You can't edit this assignment.", '42501');
  return row;
}

export async function deleteAssignment(id: string): Promise<void> {
  must(await supabase.from('fbla_assignments').delete().eq('id', id), 'Could not delete the assignment.');
}

export type AttemptLite = Pick<Attempt, 'id' | 'user_id' | 'assignment_id' | 'correct' | 'total' | 'duration_ms' | 'created_at'>;

/**
 * Attempts made for these assignments. RLS returns only the caller's own for members, and every member's for
 * chapter staff.
 */
export async function listAssignmentAttempts(assignmentIds: string[]): Promise<AttemptLite[]> {
  if (!assignmentIds.length) return [];
  const out: AttemptLite[] = [];
  for (let i = 0; i < assignmentIds.length; i += 100) {
    const res = await supabase
      .from('fbla_attempts')
      .select('id,user_id,assignment_id,correct,total,duration_ms,created_at')
      .in('assignment_id', assignmentIds.slice(i, i + 100))
      .order('created_at', { ascending: false })
      .limit(5000);
    out.push(...((must(res) ?? []) as AttemptLite[]));
  }
  return out;
}

/** Records a studied deck assignment (cards known / cards studied). */
export async function completeDeckAssignment(assignmentId: string, known: number, total: number, durationMs: number): Promise<string> {
  const res = await supabase.rpc('fbla_complete_deck_assignment', {
    p_assignment: assignmentId,
    p_known: known,
    p_total: total,
    p_duration_ms: Math.round(durationMs),
  });
  return must(res as { data: string | null; error: PostgrestError | null }, 'Could not record your progress.') as string;
}

/** Where "Start" goes for a test or official assignment (decks are studied in the classroom). */
export const assignmentRunHref = (a: Pick<Assignment, 'id'>) => `/play/run?assignment=${encodeURIComponent(a.id)}`;

/** Official assignments run this many questions (RunPage's OFFICIAL_ASSIGNMENT_SIZE). */
export const OFFICIAL_ASSIGNMENT_QUESTIONS = 25;

export type AssignmentStatus = 'todo' | 'done' | 'overdue';

export function assignmentStatus(a: Pick<Assignment, 'due_at'>, attempts: AttemptLite[], now = Date.now()): AssignmentStatus {
  if (attempts.length) return 'done';
  if (a.due_at && new Date(a.due_at).getTime() < now) return 'overdue';
  return 'todo';
}

/** Best attempt by score, then earliest. */
export function bestAttempt(attempts: AttemptLite[]): AttemptLite | null {
  let best: AttemptLite | null = null;
  for (const t of attempts) {
    const s = t.correct / Math.max(1, t.total);
    const b = best ? best.correct / Math.max(1, best.total) : -1;
    if (s > b || (s === b && best && t.created_at < best.created_at)) best = t;
  }
  return best;
}

export const pct = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : 0);
