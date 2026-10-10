// Pure helpers behind /play/run: URL params -> run spec, and the deterministic question pickers that
// aren't already in src/lib/pick.ts (daily challenge, stratified mock exam, weak-spot mix).
import { seeded, shuffle } from '../../lib/srs';
import type { AttemptKind } from '../../lib/types';

export type RunMode =
  | 'quick'
  | 'practice'
  | 'daily'
  | 'endless'
  | 'weak'
  | 'mock'
  | 'area'
  | 'assignment'
  | 'custom'
  | 'redo';

export type RunSpec = {
  mode: RunMode;
  event: string | null;
  area: string | null;
  n: number | null;
  assignment: string | null;
  test: string | null;
  /** attempt id, or "wrong" for every open miss */
  redo: string | null;
  /** with redo=<attemptId>: only the questions missed in that attempt */
  onlyWrong: boolean;
  /** mode=redo&ids=a,b,c: an explicit list of official question ids (max 100) */
  ids: string[];
  /** optional run label (used with ids) */
  label: string | null;
};

const MODES: RunMode[] = ['quick', 'practice', 'daily', 'endless', 'weak', 'mock', 'area', 'assignment', 'custom', 'redo'];

export function parseRunSpec(p: URLSearchParams): RunSpec {
  // `kind` and `sub` are accepted as aliases of `mode` and `area` for older links.
  const raw = (p.get('mode') ?? p.get('kind') ?? '').toLowerCase();
  const ids = (p.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  const test = p.get('test');
  const assignment = p.get('assignment');
  const redo = p.get('redo');
  let mode: RunMode = (MODES as string[]).includes(raw) ? (raw as RunMode) : 'quick';
  if (assignment) mode = 'assignment';
  else if (test) mode = 'custom';
  else if (redo || ids.length) mode = 'redo';
  else if (raw === 'assigned') mode = 'assignment';
  const nRaw = Number(p.get('n'));
  return {
    mode,
    event: p.get('event') || null,
    area: p.get('area') || p.get('sub') || null,
    n: Number.isFinite(nRaw) && nRaw > 0 ? Math.min(100, Math.round(nRaw)) : null,
    assignment,
    test,
    redo,
    onlyWrong: p.get('only') === 'wrong',
    ids,
    label: p.get('label')?.slice(0, 120) || null,
  };
}

/** The attempt kind the server records for a mode. */
export const KIND_FOR_MODE: Record<RunMode, AttemptKind> = {
  quick: 'practice',
  practice: 'practice',
  daily: 'daily',
  endless: 'endless',
  weak: 'weak',
  mock: 'mock',
  area: 'area',
  assignment: 'assignment',
  custom: 'custom',
  redo: 'redo',
};

/** Build a /play/run link. */
export function runHref(params: Partial<Record<'mode' | 'event' | 'area' | 'n' | 'assignment' | 'test' | 'redo' | 'only' | 'ids' | 'label', string | number | null | undefined>>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  return `/play/run?${sp.toString()}`;
}

export const DAILY_SIZE = 10;
export const MOCK_SECONDS_PER_QUESTION = 30; // 100 questions in 50 minutes, the official format

/**
 * Today's daily challenge: the same for everyone. Picks `size` events (no repeats while possible) and a
 * question index in each, from a seed on the date. Callers sort each event's ids and take pick % length.
 */
export function dailyPlan(day: string, slugs: readonly string[], size = DAILY_SIZE): { event: string; pick: number }[] {
  const rand = seeded(`kcb-fbla-daily:${day}`);
  const order: string[] = [];
  while (order.length < size && slugs.length) order.push(...shuffle([...slugs].sort(), rand));
  return order.slice(0, size).map((event) => ({ event, pick: Math.floor(rand() * 1_000_000) }));
}

type QLike = { id: string; sub: string; diff?: number | null };

/** Resolve a daily plan against loaded questions; easiest first so the set ramps up. */
export function resolveDaily<T extends QLike>(plan: { event: string; pick: number }[], byEvent: Map<string, T[]>): T[] {
  const used = new Set<string>();
  const out: T[] = [];
  for (const { event, pick } of plan) {
    const ids = [...(byEvent.get(event) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    if (!ids.length) continue;
    for (let k = 0; k < ids.length; k++) {
      const q = ids[(pick + k) % ids.length];
      if (!used.has(q.id)) {
        used.add(q.id);
        out.push(q);
        break;
      }
    }
  }
  return out
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (a.q.diff ?? 2) - (b.q.diff ?? 2) || a.i - b.i)
    .map((x) => x.q);
}

/**
 * Mock exam: `n` questions with each competency area represented in proportion to the bank (largest
 * remainder rounding), then shuffled. With n >= the bank, it is the whole bank shuffled.
 */
export function mockSet<T extends QLike>(qs: T[], n: number, rand: () => number = Math.random): T[] {
  if (n >= qs.length) return shuffle(qs, rand);
  const bySub = new Map<string, T[]>();
  for (const q of qs) bySub.set(q.sub, [...(bySub.get(q.sub) ?? []), q]);
  const subs = [...bySub.entries()].map(([sub, list]) => {
    const exact = (list.length / qs.length) * n;
    return { sub, list: shuffle(list, rand), quota: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = n - subs.reduce((s, x) => s + x.quota, 0);
  for (const s of [...subs].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    if (s.quota < s.list.length) {
      s.quota++;
      left--;
    }
  }
  return shuffle(
    subs.flatMap((s) => s.list.slice(0, s.quota)),
    rand,
  );
}

/**
 * Weak-spot mix: open misses first (up to half), then unmastered questions from the worst areas
 * (fbla_weak_spots order), unseen before seen, then any remaining misses.
 */
export function weakMix<T extends QLike & { topic?: string; event?: string | null }>(
  qs: T[],
  opts: {
    misses: string[];
    spots: { event: string; sub: string; accuracy: number; answered: number }[];
    mastered: Set<string>;
    seen: Set<string>;
    n: number;
    rand?: () => number;
  },
): T[] {
  const { misses, spots, mastered, seen, n } = opts;
  const rand = opts.rand ?? Math.random;
  const byId = new Map(qs.map((q) => [q.id, q]));
  const picked: T[] = [];
  const has = new Set<string>();
  const take = (q: T | undefined) => {
    if (q && !has.has(q.id) && picked.length < n) {
      has.add(q.id);
      picked.push(q);
    }
  };
  const missQs = misses.map((id) => byId.get(id)).filter((q): q is T => !!q);
  missQs.slice(0, Math.ceil(n / 2)).forEach(take);
  const evOf = (q: T) => q.event ?? q.topic ?? '';
  const pools = spots
    .filter((s) => s.accuracy < 0.999 && s.answered >= 2)
    .map((s) => {
      const pool = qs.filter((q) => evOf(q) === s.event && q.sub === s.sub && !mastered.has(q.id));
      return [...shuffle(pool.filter((q) => seen.has(q.id)), rand), ...shuffle(pool.filter((q) => !seen.has(q.id)), rand)];
    });
  // first pass spreads the set across areas (a third of it at most from one area), second pass fills up
  for (const pool of pools) pool.slice(0, Math.max(2, Math.ceil(n / 3))).forEach(take);
  for (const pool of pools) pool.forEach(take);
  missQs.forEach(take);
  return shuffle(picked, rand);
}
