// The three separate numbers on the site, all computed from the answer log so they can never drift:
// rating (Elo vs question difficulty, first attempts only, floor 0), mastery (right first time, or right twice
// in a row) and readiness (predicted score on one event's test, from first attempts in that event).

export type Diff = 1 | 2 | 3;
export type Answer = {
  qid: string;
  topic: string;
  sub: string;
  diff: Diff;
  correct: boolean;
  first: boolean; // the member's first ever attempt at this question
  ms: number;
  mode: string;
  at: string; // ISO time
};

export const K = 32;
// Question strength on the rating scale. A member at 0 has even odds on a medium question.
export const Q_RATING: Record<Diff, number> = { 1: -200, 2: 0, 3: 200 };

const byTime = <T extends { at: string }>(list: T[]) =>
  [...list].sort((x, y) => x.at.localeCompare(y.at));

export type RatingPoint = { at: string; rating: number };
export function rating(answers: Answer[]) {
  let r = 0,
    peak = 0;
  const history: RatingPoint[] = [];
  for (const a of byTime(answers)) {
    if (!a.first) continue;
    const expected = 1 / (1 + 10 ** ((Q_RATING[a.diff] - r) / 400));
    r = Math.max(0, r + K * ((a.correct ? 1 : 0) - expected));
    peak = Math.max(peak, r);
    history.push({ at: a.at, rating: r });
  }
  return { rating: r, peak, history };
}

// Rating as it stood at a moment (for "+12 this week").
export function ratingAt(history: RatingPoint[], at: string) {
  let r = 0;
  for (const p of history) {
    if (p.at > at) break;
    r = p.rating;
  }
  return r;
}

export function mastery(answers: Answer[]) {
  const runs = new Map<
    string,
    { mastered: boolean; prev: boolean | null; last: boolean }
  >();
  for (const a of byTime(answers)) {
    const s = runs.get(a.qid);
    if (!s) {
      runs.set(a.qid, {
        mastered: a.correct,
        prev: a.correct,
        last: a.correct,
      });
      continue;
    }
    if (a.correct && s.prev === true) s.mastered = true;
    s.prev = a.correct;
    s.last = a.correct;
  }
  const mastered: string[] = [],
    openMisses: string[] = [];
  for (const [qid, s] of runs) {
    if (s.mastered) mastered.push(qid);
    if (!s.last) openMisses.push(qid);
  }
  return {
    mastered: mastered.length,
    masteredIds: new Set(mastered),
    openMisses,
    seen: runs.size,
  };
}

export const RANKS = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Emerald",
  "Goatatron 3000",
  "Goatatron top g",
] as const;
export type Rank = (typeof RANKS)[number];
const AT = [
  0, 5, 10, 20, 30, 40, 55, 70, 85, 105, 125, 150, 175, 200, 230, 260, 300, 340,
  380, 430, 480, 540, 600, 670, 750, 850, 1000,
];
const ROMAN = ["I", "II", "III"];
export type Tier = {
  index: number;
  rank: Rank;
  level: 1 | 2 | 3;
  name: string;
  at: number;
};
export const TIERS: Tier[] = AT.map((at, index) => {
  const rank = RANKS[Math.floor(index / 3)];
  const level = ((index % 3) + 1) as 1 | 2 | 3;
  return { index, rank, level, name: `${rank} ${ROMAN[level - 1]}`, at };
});

export function tierFor(mastered: number) {
  let t = TIERS[0];
  for (const x of TIERS) if (mastered >= x.at) t = x;
  const next = TIERS[t.index + 1] ?? null;
  const span = next ? next.at - t.at : 1;
  return {
    ...t,
    next,
    toNext: next ? next.at - mastered : null,
    progress: next ? (mastered - t.at) / span : 1,
  };
}

export const READY_MIN = 15;
export type SubWeight = { name: string; count: number };
export type SubPoints = {
  name: string;
  weight: number;
  seen: number;
  right: number;
  acc: number;
  points: number;
  max: number;
};
export type Readiness =
  | { ready: false; used: number; need: number }
  | {
      ready: true;
      used: number;
      score: number;
      low: number;
      high: number;
      subs: SubPoints[];
    };

// Predicted score out of 100: each competency area is worth its share of the bank, scored at the member's
// smoothed first-attempt accuracy there (areas with no data borrow the overall rate). The range is a 90%
// interval on the overall rate, so it tightens as more first attempts come in.
export function readiness(
  answers: Answer[],
  topic: string,
  subs: SubWeight[],
): Readiness {
  const firsts = answers.filter((a) => a.first && a.topic === topic);
  const used = firsts.length;
  if (used < READY_MIN) return { ready: false, used, need: READY_MIN - used };
  const right = firsts.filter((a) => a.correct).length;
  const overall = (right + 1) / (used + 2);
  const total = subs.reduce((s, x) => s + x.count, 0) || 1;
  const parts: SubPoints[] = subs.map((s) => {
    const mine = firsts.filter((a) => a.sub === s.name);
    const r = mine.filter((a) => a.correct).length;
    // shrink toward the overall rate with 3 pseudo-answers so one lucky question doesn't swing an area
    const acc = (r + 3 * overall) / (mine.length + 3);
    const max = (s.count / total) * 100;
    return {
      name: s.name,
      weight: s.count / total,
      seen: mine.length,
      right: r,
      acc,
      points: max * acc,
      max,
    };
  });
  const score = parts.reduce((s, p) => s + p.points, 0);
  const half = 1.645 * Math.sqrt((overall * (1 - overall)) / used) * 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return {
    ready: true,
    used,
    score: Math.round(score),
    low: Math.round(clamp(score - half)),
    high: Math.round(clamp(score + half)),
    subs: parts,
  };
}
