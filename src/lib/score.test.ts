import { describe, expect, it } from "vitest";
import {
  rating,
  mastery,
  tierFor,
  TIERS,
  readiness,
  type Answer,
} from "./score";

const a = (
  qid: string,
  correct: boolean,
  at: string,
  extra: Partial<Answer> = {},
): Answer => ({
  qid,
  topic: "accounting",
  sub: "Journals",
  diff: 2,
  correct,
  first: true,
  ms: 10000,
  mode: "paper",
  at,
  ...extra,
});

describe("rating", () => {
  it("starts at 0 with no answers", () => {
    expect(rating([]).rating).toBe(0);
  });

  it("a first-attempt correct answer on an even question gains half of K (16)", () => {
    expect(rating([a("q1", true, "2026-10-01T12:00:00Z")]).rating).toBeCloseTo(
      16,
      5,
    );
  });

  it("never drops below 0", () => {
    expect(rating([a("q1", false, "2026-10-01T12:00:00Z")]).rating).toBe(0);
  });

  it("ignores repeat attempts so known questions cannot be farmed", () => {
    const r = rating([
      a("q1", true, "2026-10-01T12:00:00Z"),
      a("q1", true, "2026-10-01T12:01:00Z", { first: false }),
      a("q1", true, "2026-10-01T12:02:00Z", { first: false }),
    ]);
    expect(r.rating).toBeCloseTo(16, 5);
  });

  it("a hard question pays more than an easy one", () => {
    const hard = rating([
      a("q1", true, "2026-10-01T12:00:00Z", { diff: 3 }),
    ]).rating;
    const easy = rating([
      a("q1", true, "2026-10-01T12:00:00Z", { diff: 1 }),
    ]).rating;
    expect(hard).toBeGreaterThan(16);
    expect(easy).toBeLessThan(16);
  });

  it("tracks the peak even after a fall", () => {
    const r = rating([
      a("q1", true, "2026-10-01T12:00:00Z"),
      a("q2", false, "2026-10-01T12:01:00Z"),
    ]);
    expect(r.peak).toBeCloseTo(16, 5);
    expect(r.rating).toBeLessThan(16);
  });
});

describe("mastery", () => {
  it("counts a question right on the first try as mastered", () => {
    expect(mastery([a("q1", true, "2026-10-01T12:00:00Z")]).mastered).toBe(1);
  });

  it("counts two right in a row after a miss as mastered", () => {
    const m = mastery([
      a("q1", false, "2026-10-01T12:00:00Z"),
      a("q1", true, "2026-10-02T12:00:00Z", { first: false }),
      a("q1", true, "2026-10-03T12:00:00Z", { first: false }),
    ]);
    expect(m.mastered).toBe(1);
  });

  it("does not count right-wrong-right as mastered", () => {
    const m = mastery([
      a("q1", false, "2026-10-01T12:00:00Z"),
      a("q1", true, "2026-10-02T12:00:00Z", { first: false }),
      a("q1", false, "2026-10-03T12:00:00Z", { first: false }),
      a("q1", true, "2026-10-04T12:00:00Z", { first: false }),
    ]);
    expect(m.mastered).toBe(0);
  });

  it("lists questions whose latest attempt was wrong as open misses", () => {
    const m = mastery([
      a("q1", false, "2026-10-01T12:00:00Z"),
      a("q2", false, "2026-10-01T12:00:00Z"),
      a("q2", true, "2026-10-02T12:00:00Z", { first: false }),
    ]);
    expect(m.openMisses).toEqual(["q1"]);
  });
});

describe("tiers", () => {
  it("has 27 tiers from Iron I to Goatatron top g III", () => {
    expect(TIERS).toHaveLength(27);
    expect(TIERS[0].name).toBe("Iron I");
    expect(TIERS[26].name).toBe("Goatatron top g III");
  });

  it("puts 0 mastered at Iron I with 5 to go", () => {
    const t = tierFor(0);
    expect(t.name).toBe("Iron I");
    expect(t.toNext).toBe(5);
  });

  it("orders Platinum below Diamond below Emerald", () => {
    const names = TIERS.map((t) => t.rank);
    expect(names.indexOf("Platinum")).toBeLessThan(names.indexOf("Diamond"));
    expect(names.indexOf("Diamond")).toBeLessThan(names.indexOf("Emerald"));
  });

  it("reports no next tier at the top", () => {
    expect(tierFor(5000).toNext).toBeNull();
  });
});

describe("readiness", () => {
  const subs = [
    { name: "Journals", count: 50 },
    { name: "Ratios", count: 50 },
  ];

  it("asks for more practice under 15 first attempts", () => {
    const r = readiness(
      [a("q1", true, "2026-10-01T12:00:00Z")],
      "accounting",
      subs,
    );
    expect(r.ready).toBe(false);
    expect(r.need).toBe(14);
  });

  it("predicts higher for a stronger record and keeps the range around the score", () => {
    const many = (right: number) =>
      Array.from({ length: 20 }, (_, i) =>
        a("q" + i, i < right, "2026-10-01T12:00:00Z", {
          sub: i % 2 ? "Ratios" : "Journals",
        }),
      );
    const strong = readiness(many(18), "accounting", subs);
    const weak = readiness(many(6), "accounting", subs);
    expect(strong.ready && weak.ready).toBe(true);
    if (!strong.ready || !weak.ready) return;
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.low).toBeLessThanOrEqual(strong.score);
    expect(strong.high).toBeGreaterThanOrEqual(strong.score);
    expect(strong.used).toBe(20);
  });

  it("only uses first attempts from the chosen event", () => {
    const list = [
      ...Array.from({ length: 15 }, (_, i) =>
        a("q" + i, true, "2026-10-01T12:00:00Z"),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        a("e" + i, false, "2026-10-01T12:00:00Z", { topic: "economics" }),
      ),
    ];
    const r = readiness(list, "accounting", subs);
    expect(r.ready && r.used).toBe(15);
  });
});
