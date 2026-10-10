// The Me tab's numbers, all from the logs.
import type { Answer } from "./score";
import { dayKey, addDays, type Review } from "./srs";

export type Paper = {
  kind: string;
  topic: string | null;
  label: string;
  total: number;
  correct: number;
  ms: number;
  at: string;
};
export type Duel = {
  id: string;
  topic: string;
  seed: string;
  size: number;
  challenger: string;
  opponent: string;
  c_score: number | null;
  c_ms: number | null;
  o_score: number | null;
  o_ms: number | null;
  at: string;
};

export const ANSWER_CAP = 90_000; // a question left open longer than this still counts as 90 s of study
export const REVIEW_CAP = 30_000;

export function duelResult(
  d: Duel,
  me: string,
): "win" | "loss" | "tie" | "pending" {
  if (d.c_score == null || d.o_score == null) return "pending";
  const mine =
    d.challenger === me ? [d.c_score, d.c_ms ?? 0] : [d.o_score, d.o_ms ?? 0];
  const theirs =
    d.challenger === me ? [d.o_score, d.o_ms ?? 0] : [d.c_score, d.c_ms ?? 0];
  if (mine[0] !== theirs[0]) return mine[0] > theirs[0] ? "win" : "loss";
  if (mine[1] !== theirs[1]) return mine[1] < theirs[1] ? "win" : "loss"; // faster wins a tie on score
  return "tie";
}

export function dayStreak(days: Set<string>, today: string) {
  const sorted = [...days].sort();
  let best = 0,
    run = 0,
    prev = "";
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

// Monday of this week, local
export function weekStart(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function summarize(o: {
  answers: Answer[];
  reviews: Review[];
  papers: Paper[];
  duels: Duel[];
  me: string;
  now: Date;
}) {
  const answers = [...o.answers].sort((x, y) => x.at.localeCompare(y.at));
  const answered = answers.length;
  const unique = new Set(answers.map((a) => a.qid)).size;
  const right = answers.filter((a) => a.correct).length;
  const firsts = answers.filter((a) => a.first);
  let best = 0,
    cur = 0;
  for (const a of answers) {
    cur = a.correct ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  const aMs = (a: Answer) => Math.min(a.ms, ANSWER_CAP);
  const rMs = (r: Review) => Math.min(r.ms, REVIEW_CAP);
  const week = weekStart(o.now).getTime();
  const timeMs =
    answers.reduce((s, a) => s + aMs(a), 0) +
    o.reviews.reduce((s, r) => s + rMs(r), 0);
  const weekMs =
    answers
      .filter((a) => new Date(a.at).getTime() >= week)
      .reduce((s, a) => s + aMs(a), 0) +
    o.reviews
      .filter((r) => new Date(r.at).getTime() >= week)
      .reduce((s, r) => s + rMs(r), 0);
  const days = new Set([
    ...answers.map((a) => dayKey(a.at)),
    ...o.reviews.map((r) => dayKey(r.at)),
  ]);
  const streak = dayStreak(days, dayKey(o.now));
  const results = o.duels
    .map((d) => duelResult(d, o.me))
    .filter((r) => r !== "pending");
  const scored = o.papers.filter((p) => p.total >= 25);
  const bestPaper = scored.length
    ? Math.max(...scored.map((p) => p.correct / p.total))
    : null;
  return {
    answered,
    unique,
    accuracy: answered ? right / answered : null,
    firstAccuracy: firsts.length
      ? firsts.filter((a) => a.correct).length / firsts.length
      : null,
    bestStreak: best,
    curStreak: cur,
    dayStreak: streak.current,
    dayRecord: streak.best,
    timeMs,
    weekMs,
    perQuestionMs: answered
      ? answers.reduce((s, a) => s + aMs(a), 0) / answered
      : null,
    wins: results.filter((r) => r === "win").length,
    losses: results.filter((r) => r === "loss").length,
    duels: results.length,
    bestPaper,
    papers: o.papers.length,
    days,
  };
}
export type Summary = ReturnType<typeof summarize>;
