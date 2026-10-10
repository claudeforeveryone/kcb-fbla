// Vocab spaced repetition: a Leitner schedule replayed from the review log. Right moves a term up a box and
// pushes it out (1, 2, 4, 8, 16, 32 days); wrong drops it to box 1, due again today. Box 4+ is mastered.

export type Review = { term: string; correct: boolean; ms: number; at: string };
export type Term = {
  id: string;
  term: string;
  def: string;
  topic: string;
  sub?: string;
  mine?: boolean;
};
export type TermState = {
  box: number;
  due: string;
  seen: number;
  misses: number;
  mastered: boolean;
  firstDay: string;
  lastAt: string;
};

export const INTERVALS = [0, 1, 2, 4, 8, 16, 32];
export const MASTER_BOX = 4;
export const NEW_TARGET = 20;

// local calendar day 'YYYY-MM-DD'
export const dayKey = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12));
};

export function states(reviews: Review[]) {
  const map = new Map<string, TermState>();
  for (const rv of [...reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    const day = dayKey(rv.at);
    const s = map.get(rv.term) ?? {
      box: 0,
      due: day,
      seen: 0,
      misses: 0,
      mastered: false,
      firstDay: day,
      lastAt: rv.at,
    };
    s.seen++;
    s.lastAt = rv.at;
    if (rv.correct) {
      s.box = Math.min(s.box + 1, INTERVALS.length - 1);
      s.due = addDays(day, INTERVALS[s.box]);
    } else {
      s.box = 1;
      s.due = day;
      s.misses++;
    }
    s.mastered = s.box >= MASTER_BOX;
    map.set(rv.term, s);
  }
  return map;
}

export type DeckFilter =
  "today" | "smart" | "due" | "new" | "misses" | "everything";
export const DECK_FILTERS: { id: DeckFilter; label: string; hint: string }[] = [
  {
    id: "today",
    label: "Today",
    hint: "Today's reviews plus today's new terms",
  },
  { id: "smart", label: "Smart", hint: "Due first, then misses, then new" },
  { id: "due", label: "Due", hint: "Terms that need review" },
  { id: "new", label: "New", hint: "Terms you haven't studied" },
  { id: "misses", label: "Misses", hint: "Terms you've missed before" },
  { id: "everything", label: "Everything", hint: "Every term" },
];

export type DeckOpts = {
  filter: DeckFilter;
  topics: string[];
  today: string;
  newTarget: number;
  newDoneToday: number;
};
export function buildDeck(
  terms: Term[],
  st: Map<string, TermState>,
  o: DeckOpts,
): Term[] {
  const pool = o.topics.length
    ? terms.filter((t) => o.topics.includes(t.topic))
    : terms;
  const isDue = (t: Term) => {
    const s = st.get(t.id);
    return !!s && s.due <= o.today;
  };
  const isNew = (t: Term) => !st.has(t.id);
  const isMiss = (t: Term) => {
    const s = st.get(t.id);
    return !!s && s.misses > 0 && !s.mastered;
  };
  const box = (t: Term) => st.get(t.id)?.box ?? 0;
  const newLeft = Math.max(0, o.newTarget - o.newDoneToday);
  const due = pool.filter(isDue).sort((a, b) => box(a) - box(b));
  switch (o.filter) {
    case "due":
      return due;
    case "new":
      return pool.filter(isNew);
    case "misses":
      return pool.filter(isMiss);
    case "everything":
      return pool;
    case "today":
      return [...due, ...pool.filter(isNew).slice(0, newLeft)];
    case "smart": {
      const misses = pool.filter((t) => isMiss(t) && !isDue(t));
      return [
        ...due,
        ...misses,
        ...pool.filter(isNew).slice(0, Math.max(newLeft, 5)),
      ];
    }
  }
}

export function daySummary(reviews: Review[], today: string) {
  const firstDay = new Map<string, string>();
  for (const rv of [...reviews].sort((a, b) => a.at.localeCompare(b.at)))
    if (!firstDay.has(rv.term)) firstDay.set(rv.term, dayKey(rv.at));
  let newDone = 0;
  for (const d of firstDay.values()) if (d === today) newDone++;
  const todays = reviews.filter((rv) => dayKey(rv.at) === today);
  return {
    newDone,
    reviewedToday: todays.length,
    rightToday: todays.filter((r) => r.correct).length,
  };
}

// Fisher-Yates with an optional seeded generator (seeded so a duel's two players get the same paper)
export function shuffle<T>(list: T[], rand: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
