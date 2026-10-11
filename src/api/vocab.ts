// Vocab: official per-event term lists (static content), chapter flashcard decks (fbla_decks), deck assignments
// (fbla_assignments kind 'deck'), and the member's Leitner progress (fbla_vocab_progress).
//
// Term ids: official terms keep their content id ("acc-v001"); chapter deck cards are `deck:<deckId>:<n>` with n the
// 0-based card index. Progress rows use these ids, so staff can see who has studied an assigned deck.
import { supabase } from '../lib/supabase';
import { loadIndex, loadVocab, type Topic } from '../lib/content';
import { EVENTS, type Assignment, type Deck, type DeckCard, type EventGroup, type VocabProgress } from '../lib/types';
import { ApiError, toApiError } from './core';

export type VocabTerm = {
  id: string;
  term: string;
  def: string;
  /** Event slug, when the term belongs to one. */
  event: string | null;
  sub: string | null;
  /** Which study deck the term lives in (event slug or `deck-<uuid>`). */
  deckKey: string;
};

export type StudyDeck = {
  /** URL segment under /vocab: the event slug, or `deck-<uuid>` for a chapter deck. */
  key: string;
  kind: 'event' | 'chapter';
  title: string;
  short: string;
  event: string | null;
  group: EventGroup | null;
  isNew: boolean;
  gradeNote: string | null;
  terms: VocabTerm[];
  /** Chapter decks only. */
  deck?: Deck;
};

export const deckTermId = (deckId: string, index: number) => `deck:${deckId}:${index}`;
export const chapterDeckKey = (deckId: string) => `deck-${deckId}`;
export function parseDeckKey(key: string): { kind: 'event'; slug: string } | { kind: 'chapter'; id: string } {
  return key.startsWith('deck-') ? { kind: 'chapter', id: key.slice(5) } : { kind: 'event', slug: key };
}

const MAX_CARDS = 200;

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError('You are signed out. Sign in and try again.', '42501');
  return id;
}

// ------------------------------------------------------------------------------------------------ official decks

/** One study deck per event, in the catalogue order, from public/content (60 terms each). */
export async function loadEventDecks(): Promise<StudyDeck[]> {
  const [topics, terms] = await Promise.all([loadIndex(), loadVocab()]);
  const byTopic = new Map<string, VocabTerm[]>();
  for (const t of terms) {
    const list = byTopic.get(t.topic) ?? [];
    list.push({ id: t.id, term: t.term, def: t.def, event: t.topic, sub: t.sub ?? null, deckKey: t.topic });
    byTopic.set(t.topic, list);
  }
  const topicBySlug = new Map<string, Topic>(topics.map((t) => [t.slug, t]));
  const order = EVENTS.map((e) => e.slug as string);
  for (const t of topics) if (!order.includes(t.slug)) order.push(t.slug);
  return order
    .filter((slug) => byTopic.has(slug))
    .map((slug) => {
      const info = EVENTS.find((e) => e.slug === slug);
      const topic = topicBySlug.get(slug);
      return {
        key: slug,
        kind: 'event' as const,
        title: info?.name ?? topic?.name ?? slug,
        short: info?.short ?? topic?.short ?? slug.slice(0, 4).toUpperCase(),
        event: slug,
        group: info?.group ?? topic?.group ?? null,
        isNew: info?.isNew ?? false,
        gradeNote: info?.gradeNote ?? topic?.gradeNote ?? null,
        terms: byTopic.get(slug)!,
      };
    });
}

export function eventShort(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return EVENTS.find((e) => e.slug === slug)?.short ?? null;
}
export function eventName(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return EVENTS.find((e) => e.slug === slug)?.name ?? null;
}

// ------------------------------------------------------------------------------------------------ chapter decks

export function chapterStudyDeck(deck: Deck): StudyDeck {
  const key = chapterDeckKey(deck.id);
  return {
    key,
    kind: 'chapter',
    title: deck.title,
    short: eventShort(deck.event) ?? 'DECK',
    event: deck.event,
    group: null,
    isNew: false,
    gradeNote: null,
    deck,
    terms: (Array.isArray(deck.cards) ? deck.cards : [])
      .filter((c) => c && c.term && c.def)
      .map((c, i) => ({ id: deckTermId(deck.id, i), term: c.term, def: c.def, event: deck.event, sub: null, deckKey: key })),
  };
}

export async function listChapterDecks(chapterId: string): Promise<Deck[]> {
  const { data, error } = await supabase
    .from('fbla_decks')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });
  if (error) throw toApiError(error, 'Could not load chapter decks.');
  return (data ?? []) as Deck[];
}

export async function getDeck(id: string): Promise<Deck | null> {
  const { data, error } = await supabase.from('fbla_decks').select('*').eq('id', id).maybeSingle<Deck>();
  if (error) throw toApiError(error, 'Could not load that deck.');
  return data;
}

export type DeckInput = { title: string; event: string | null; cards: DeckCard[] };

export function cleanCards(cards: DeckCard[]): DeckCard[] {
  return cards
    .map((c) => ({ term: c.term.trim().slice(0, 200), def: c.def.trim().slice(0, 1000) }))
    .filter((c) => c.term && c.def);
}

function validate(input: DeckInput): DeckInput {
  const title = input.title.trim();
  if (!title) throw new ApiError('Give the deck a title.');
  if (title.length > 120) throw new ApiError('Keep the title under 120 characters.');
  const cards = cleanCards(input.cards);
  if (cards.length < 2) throw new ApiError('A deck needs at least 2 cards with a term and a definition.');
  if (cards.length > MAX_CARDS) throw new ApiError(`A deck can hold up to ${MAX_CARDS} cards.`);
  return { title, event: input.event || null, cards };
}

/** Staff only (president, executive, or a trainer for the deck's event); RLS enforces it. */
export async function createDeck(chapterId: string, input: DeckInput): Promise<Deck> {
  const v = validate(input);
  const { data, error } = await supabase
    .from('fbla_decks')
    .insert({ chapter_id: chapterId, title: v.title, event: v.event, cards: v.cards })
    .select('*')
    .single<Deck>();
  if (error) throw toApiError(error, 'Could not create the deck.');
  return data;
}

export async function updateDeck(id: string, input: DeckInput): Promise<Deck> {
  const v = validate(input);
  const { data, error } = await supabase
    .from('fbla_decks')
    .update({ title: v.title, event: v.event, cards: v.cards })
    .eq('id', id)
    .select('*')
    .maybeSingle<Deck>();
  if (error) throw toApiError(error, 'Could not save the deck.');
  if (!data) throw new ApiError("You don't have permission to edit this deck.", '42501');
  return data;
}

export async function deleteDeck(id: string): Promise<void> {
  const { data, error } = await supabase.from('fbla_decks').delete().eq('id', id).select('id');
  if (error) throw toApiError(error, 'Could not delete the deck.');
  if (!data?.length) throw new ApiError("You don't have permission to delete this deck.", '42501');
}

/** Parses pasted text into cards: one per line, term and definition split by a tab, " - ", " – ", ":" or ",". */
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

// ------------------------------------------------------------------------------------------------ staff scope

export type DeckStaffScope = {
  /** President or executive: can manage any deck in the chapter. */
  admin: boolean;
  /** Events the caller trains (can manage decks for these). */
  events: string[];
};

export async function getDeckStaffScope(chapterId: string): Promise<DeckStaffScope> {
  const me = await uid();
  const [mem, tr] = await Promise.all([
    supabase.from('fbla_chapter_members').select('role').eq('user_id', me).eq('chapter_id', chapterId).maybeSingle(),
    supabase.from('fbla_trainers').select('event').eq('user_id', me).eq('chapter_id', chapterId),
  ]);
  if (mem.error) throw toApiError(mem.error);
  const role = (mem.data as { role?: string } | null)?.role;
  return {
    admin: role === 'president' || role === 'executive',
    events: tr.error ? [] : ((tr.data ?? []) as { event: string }[]).map((r) => r.event),
  };
}

export const canManageDeck = (scope: DeckStaffScope | null, event: string | null) =>
  !!scope && (scope.admin || (scope.events.length > 0 && (event === null || scope.events.includes(event))));
export const isDeckStaff = (scope: DeckStaffScope | null) => !!scope && (scope.admin || scope.events.length > 0);

// ------------------------------------------------------------------------------------------------ assignments

/** Deck assignments in the chapter (kind 'deck', ref = deck id), soonest due first. */
export async function listDeckAssignments(chapterId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('fbla_assignments')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('kind', 'deck')
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw toApiError(error, 'Could not load assignments.');
  return (data ?? []) as Assignment[];
}

/**
 * How far each member got through a chapter deck: studied = cards with any progress row, mastered = box 4+.
 * A deck assignment counts as complete when every card has been studied. Staff can read members' progress (RLS).
 */
export async function deckCompletion(
  deck: Pick<Deck, 'id' | 'cards'>,
  userIds: string[],
): Promise<Map<string, { studied: number; mastered: number; total: number; complete: boolean }>> {
  const total = Array.isArray(deck.cards) ? deck.cards.length : 0;
  const out = new Map(userIds.map((u) => [u, { studied: 0, mastered: 0, total, complete: total === 0 }]));
  if (!userIds.length || !total) return out;
  const { data, error } = await supabase
    .from('fbla_vocab_progress')
    .select('user_id, term_id, box')
    .in('user_id', userIds)
    .like('term_id', `deck:${deck.id}:%`);
  if (error) throw toApiError(error, 'Could not load deck progress.');
  for (const r of (data ?? []) as { user_id: string; term_id: string; box: number }[]) {
    const s = out.get(r.user_id);
    if (!s) continue;
    s.studied++;
    if (r.box >= 4) s.mastered++;
  }
  for (const s of out.values()) s.complete = s.studied >= s.total;
  return out;
}

// ------------------------------------------------------------------------------------------------ progress

/** All of the caller's progress rows. */
export async function getMyVocabProgress(): Promise<VocabProgress[]> {
  const me = await uid();
  const rows: VocabProgress[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('fbla_vocab_progress')
      .select('*')
      .eq('user_id', me)
      .order('term_id')
      .range(from, from + page - 1);
    if (error) throw toApiError(error, 'Could not load your vocab progress.');
    rows.push(...((data ?? []) as VocabProgress[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

export type ProgressWrite = Pick<
  VocabProgress,
  'term_id' | 'box' | 'due_at' | 'correct_count' | 'wrong_count' | 'last_reviewed_at'
>;

export type VocabReview = { term_id: string; correct: boolean };

/**
 * Records reviews, oldest first (fbla_vocab_review, 0018). The server applies the Leitner rules itself (the same
 * ones as src/pages/vocab/leitner.ts) and returns the resulting rows; clients cannot write progress rows directly.
 */
export async function recordVocabReviews(reviews: VocabReview[]): Promise<VocabProgress[]> {
  if (!reviews.length) return [];
  const out: VocabProgress[] = [];
  for (let i = 0; i < reviews.length; i += 500) {
    const { data, error } = await supabase.rpc('fbla_vocab_review', { p_reviews: reviews.slice(i, i + 500) });
    if (error) throw toApiError(error, 'Could not save your progress.');
    out.push(...((data ?? []) as VocabProgress[]));
  }
  return out;
}

/** Forgets the caller's progress on these terms (they become new again). */
export async function resetVocabProgress(termIds: string[]): Promise<void> {
  if (!termIds.length) return;
  const me = await uid();
  for (let i = 0; i < termIds.length; i += 200) {
    const { error } = await supabase
      .from('fbla_vocab_progress')
      .delete()
      .eq('user_id', me)
      .in('term_id', termIds.slice(i, i + 200));
    if (error) throw toApiError(error, 'Could not reset progress.');
  }
}
