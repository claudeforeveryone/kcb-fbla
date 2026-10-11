// Shared client state for the vocab pages: decks, assignments and the member's Leitner progress. Kept in a module
// store so moving between /vocab and a deck keeps optimistic progress, and review writes are batched.
import { useEffect, useSyncExternalStore } from 'react';
import type { Assignment, Deck } from '../../lib/types';
import {
  chapterStudyDeck,
  getDeckStaffScope,
  getMyVocabProgress,
  listChapterDecks,
  listDeckAssignments,
  loadEventDecks,
  recordVocabReviews,
  resetVocabProgress,
  type DeckStaffScope,
  type ProgressWrite,
  type StudyDeck,
  type VocabReview,
} from '../../api/vocab';
import { review, type ProgressLike, type ReviewResult } from './leitner';

export type VocabState = {
  key: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  eventDecks: StudyDeck[];
  chapterId: string | null;
  chapterDecks: StudyDeck[];
  chapterError: string | null;
  assignments: Assignment[];
  scope: DeckStaffScope | null;
  progress: ReadonlyMap<string, ProgressLike>;
  saveError: string | null;
};

let state: VocabState = {
  key: null,
  status: 'idle',
  error: null,
  eventDecks: [],
  chapterId: null,
  chapterDecks: [],
  chapterError: null,
  assignments: [],
  scope: null,
  progress: new Map(),
  saveError: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<VocabState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let loadSeq = 0;
async function load(uid: string, chapterId: string | null) {
  const seq = ++loadSeq;
  const key = `${uid}:${chapterId ?? ''}`;
  set({ key, status: 'loading', error: null, chapterId });
  try {
    const chapterPart = chapterId
      ? Promise.all([listChapterDecks(chapterId), listDeckAssignments(chapterId), getDeckStaffScope(chapterId)])
          .then(([decks, assignments, scope]) => ({ decks, assignments, scope, error: null as string | null }))
          .catch((e: Error) => ({ decks: [] as Deck[], assignments: [] as Assignment[], scope: null, error: e.message }))
      : Promise.resolve({ decks: [] as Deck[], assignments: [] as Assignment[], scope: null, error: null });
    const [eventDecks, rows, chapter] = await Promise.all([loadEventDecks(), getMyVocabProgress(), chapterPart]);
    if (seq !== loadSeq) return;
    const progress = new Map<string, ProgressLike>(rows.map((r) => [r.term_id, r]));
    // keep reviews made while this load was in flight
    for (const [id, row] of pending) progress.set(id, row);
    set({
      status: 'ready',
      eventDecks,
      progress,
      chapterDecks: chapter.decks.map(chapterStudyDeck),
      assignments: chapter.assignments,
      scope: chapter.scope,
      chapterError: chapter.error,
    });
  } catch (e) {
    if (seq !== loadSeq) return;
    set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load vocab.' });
  }
}

export function reloadVocab() {
  if (!state.key) return;
  const [uid, chapter] = state.key.split(':');
  void load(uid, chapter || null);
}

// ------------------------------------------------------------------------------------------------ writes

// Optimistic rows (what the UI shows until the server answers) and the reviews still to send. The server applies
// the same Leitner rules (fbla_vocab_review) and its rows replace the optimistic ones.
const pending = new Map<string, ProgressWrite>();
let queue: VocabReview[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) await flushing;
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  flushing = recordVocabReviews(batch)
    .then((rows) => {
      const progress = new Map(state.progress);
      const waiting = new Set(queue.map((r) => r.term_id));
      for (const row of rows) {
        if (waiting.has(row.term_id)) continue; // newer reviews are still on their way
        progress.set(row.term_id, row);
        pending.delete(row.term_id);
      }
      set({ progress, ...(state.saveError ? { saveError: null } : {}) });
    })
    .catch((e: Error & { code?: string }) => {
      set({ saveError: e.message });
      // a card the server does not know (deleted deck) will never save: drop the batch instead of retrying forever
      if (e.code === '22023') return;
      queue = [...batch, ...queue];
      schedule(8000);
    })
    .finally(() => {
      flushing = null;
    });
  await flushing;
}
function schedule(ms = 900) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}
export const flushVocab = flush;

/** Records one answer for a term (Leitner update), optimistically, and queues the write. */
export function recordReview(termId: string, correct: boolean): ReviewResult {
  const r = review(termId, state.progress.get(termId), correct);
  const { promoted: _p, demoted: _d, ...row } = r;
  const progress = new Map(state.progress);
  progress.set(termId, row);
  pending.set(termId, row);
  queue.push({ term_id: termId, correct });
  set({ progress });
  schedule();
  return r;
}

export async function resetTerms(termIds: string[]) {
  await flush();
  await resetVocabProgress(termIds);
  const progress = new Map(state.progress);
  for (const id of termIds) progress.delete(id);
  set({ progress });
}

export function upsertChapterDeck(deck: Deck) {
  const sd = chapterStudyDeck(deck);
  const rest = state.chapterDecks.filter((d) => d.key !== sd.key);
  set({ chapterDecks: [sd, ...rest].sort((a, b) => (b.deck!.created_at > a.deck!.created_at ? 1 : -1)) });
}
export function removeChapterDeck(deckId: string) {
  set({ chapterDecks: state.chapterDecks.filter((d) => d.deck?.id !== deckId) });
}

// ------------------------------------------------------------------------------------------------ hook

export function useVocab(uid: string | null | undefined, chapterId: string | null | undefined): VocabState {
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!uid) return;
    const key = `${uid}:${chapterId ?? ''}`;
    if (state.key !== key || state.status === 'error') void load(uid, chapterId ?? null);
  }, [uid, chapterId]);
  return snap;
}

export function findDeck(s: VocabState, key: string): StudyDeck | undefined {
  return s.eventDecks.find((d) => d.key === key) ?? s.chapterDecks.find((d) => d.key === key);
}

/** Assignment for a chapter deck, if any (earliest due). */
export function assignmentFor(s: VocabState, deckId: string | undefined): Assignment | undefined {
  if (!deckId) return undefined;
  return s.assignments.find((a) => a.ref === deckId);
}

// ------------------------------------------------------------------------------------------------ local bests

const BEST_KEY = 'kcbfbla:vocab:match-best';
export function getMatchBest(deckKey: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Record<string, number>;
    return typeof all[deckKey] === 'number' ? all[deckKey] : null;
  } catch {
    return null;
  }
}
export function setMatchBest(deckKey: string, ms: number) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Record<string, number>;
    all[deckKey] = ms;
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: best time just isn't remembered */
  }
}
