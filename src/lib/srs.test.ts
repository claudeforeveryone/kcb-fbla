import { describe, expect, it } from "vitest";
import { states, buildDeck, daySummary, type Review, type Term } from "./srs";

const r = (term: string, correct: boolean, at: string): Review => ({
  term,
  correct,
  ms: 4000,
  at,
});
const terms: Term[] = [
  { id: "a", term: "Asset", def: "x", topic: "accounting" },
  { id: "b", term: "Bond", def: "x", topic: "securities-investments" },
  { id: "c", term: "Cost", def: "x", topic: "accounting" },
  { id: "d", term: "Debit", def: "x", topic: "accounting" },
];

describe("states", () => {
  it("moves a term up a box per right answer and schedules it later", () => {
    const s = states([
      r("a", true, "2026-10-01T12:00:00"),
      r("a", true, "2026-10-02T12:00:00"),
    ]);
    expect(s.get("a")!.box).toBe(2);
    expect(s.get("a")!.due).toBe("2026-10-04");
  });

  it("sends a missed term back to box 1, due the same day, and counts the miss", () => {
    const s = states([
      r("a", true, "2026-10-01T12:00:00"),
      r("a", false, "2026-10-02T12:00:00"),
    ]);
    expect(s.get("a")!.box).toBe(1);
    expect(s.get("a")!.due).toBe("2026-10-02");
    expect(s.get("a")!.misses).toBe(1);
  });

  it("calls a term mastered after four right in a row", () => {
    const s = states(
      ["01", "02", "04", "08"].map((d) =>
        r("a", true, `2026-10-${d}T12:00:00`),
      ),
    );
    expect(s.get("a")!.mastered).toBe(true);
  });
});

describe("buildDeck", () => {
  const s = states([
    r("a", true, "2026-10-01T12:00:00"),
    r("b", false, "2026-10-01T12:00:00"),
  ]);
  const base = {
    today: "2026-10-05",
    newTarget: 1,
    newDoneToday: 0,
    topics: [] as string[],
  };

  it("Due holds only seen terms whose day has come", () => {
    expect(
      buildDeck(terms, s, { ...base, filter: "due" })
        .map((t) => t.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("New holds unseen terms", () => {
    expect(
      buildDeck(terms, s, { ...base, filter: "new" })
        .map((t) => t.id)
        .sort(),
    ).toEqual(["c", "d"]);
  });

  it("Misses holds terms missed at least once and not yet mastered", () => {
    expect(
      buildDeck(terms, s, { ...base, filter: "misses" }).map((t) => t.id),
    ).toEqual(["b"]);
  });

  it("Today adds new terms only up to what is left of the daily target", () => {
    expect(buildDeck(terms, s, { ...base, filter: "today" })).toHaveLength(3);
    expect(
      buildDeck(terms, s, { ...base, filter: "today", newDoneToday: 1 }),
    ).toHaveLength(2);
  });

  it("a topic filter narrows every deck", () => {
    expect(
      buildDeck(terms, s, {
        ...base,
        filter: "everything",
        topics: ["accounting"],
      })
        .map((t) => t.id)
        .sort(),
    ).toEqual(["a", "c", "d"]);
  });
});

describe("daySummary", () => {
  it("counts new terms first seen today", () => {
    const list = [
      r("a", true, "2026-10-04T12:00:00"),
      r("b", true, "2026-10-05T09:00:00"),
      r("a", true, "2026-10-05T10:00:00"),
    ];
    expect(daySummary(list, "2026-10-05").newDone).toBe(1);
  });
});
