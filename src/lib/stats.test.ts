import { describe, expect, it } from "vitest";
import { summarize, dayStreak } from "./stats";
import type { Answer } from "./score";

const a = (
  qid: string,
  correct: boolean,
  at: string,
  first = true,
  ms = 20000,
): Answer => ({
  qid,
  topic: "economics",
  sub: "Micro",
  diff: 2,
  correct,
  first,
  ms,
  mode: "practice",
  at,
});

describe("summarize", () => {
  const list = [
    a("q1", true, "2026-10-01T12:00:00"),
    a("q2", true, "2026-10-01T12:01:00"),
    a("q3", false, "2026-10-01T12:02:00"),
    a("q3", true, "2026-10-01T12:03:00", false),
    a("q4", true, "2026-10-01T12:04:00"),
  ];
  const s = summarize({
    answers: list,
    reviews: [],
    papers: [],
    duels: [],
    me: "me",
    now: new Date("2026-10-01T13:00:00"),
  });

  it("counts answers and unique questions", () => {
    expect(s.answered).toBe(5);
    expect(s.unique).toBe(4);
  });

  it("splits overall accuracy from first-attempt accuracy", () => {
    expect(s.accuracy).toBeCloseTo(0.8);
    expect(s.firstAccuracy).toBeCloseTo(0.75);
  });

  it("finds the best and current run of right answers", () => {
    expect(s.bestStreak).toBe(2);
    expect(s.curStreak).toBe(2);
  });

  it("caps a single answer at 90 seconds of study time", () => {
    const t = summarize({
      answers: [a("q1", true, "2026-10-01T12:00:00", true, 600000)],
      reviews: [],
      papers: [],
      duels: [],
      me: "me",
      now: new Date("2026-10-01T13:00:00"),
    });
    expect(t.timeMs).toBe(90000);
  });

  it("records duel wins and losses from the member side", () => {
    const t = summarize({
      answers: [],
      reviews: [],
      papers: [],
      me: "me",
      now: new Date("2026-10-01T13:00:00"),
      duels: [
        {
          id: "1",
          topic: "x",
          seed: "s",
          size: 10,
          challenger: "me",
          opponent: "k",
          c_score: 8,
          c_ms: 1,
          o_score: 6,
          o_ms: 1,
          at: "",
        },
        {
          id: "2",
          topic: "x",
          seed: "s",
          size: 10,
          challenger: "k",
          opponent: "me",
          c_score: 9,
          c_ms: 1,
          o_score: 6,
          o_ms: 1,
          at: "",
        },
        {
          id: "3",
          topic: "x",
          seed: "s",
          size: 10,
          challenger: "k",
          opponent: "me",
          c_score: 9,
          c_ms: 1,
          o_score: null,
          o_ms: null,
          at: "",
        },
      ],
    });
    expect([t.wins, t.losses, t.duels]).toEqual([1, 1, 2]);
  });
});

describe("dayStreak", () => {
  it("counts consecutive study days ending today or yesterday", () => {
    const days = new Set([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-09-20",
    ]);
    expect(dayStreak(days, "2026-10-04")).toEqual({ current: 3, best: 3 });
    expect(dayStreak(days, "2026-10-06").current).toBe(0);
  });
});
