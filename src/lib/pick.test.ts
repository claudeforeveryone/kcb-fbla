import { describe, expect, it } from "vitest";
import { practiceSet, weakReport, weakSet, nextEndless } from "./pick";
import type { Answer } from "./score";

const qs = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({
  id,
  sub: i < 3 ? "Ratios" : "Journals",
  topic: "accounting",
}));
const ans = (
  qid: string,
  correct: boolean,
  at: string,
  sub = "Ratios",
): Answer => ({
  qid,
  topic: "accounting",
  sub,
  diff: 2,
  correct,
  first: true,
  ms: 1000,
  mode: "x",
  at,
});

describe("practiceSet", () => {
  it("serves unseen questions before ones already mastered", () => {
    const set = practiceSet(qs, [ans("a", true, "2026-10-01T10:00:00")], 5);
    expect(set.map((q) => q.id)).not.toContain("a");
  });
  it("can stay inside one competency area", () => {
    expect(
      practiceSet(qs, [], 10, "Journals").every((q) => q.sub === "Journals"),
    ).toBe(true);
  });
});

describe("weak spots", () => {
  const history = [
    ans("a", false, "2026-10-01T10:00:00"),
    ans("b", false, "2026-10-01T10:01:00"),
    ans("c", true, "2026-10-01T10:02:00"),
    ans("d", true, "2026-10-01T10:03:00", "Journals"),
    ans("e", true, "2026-10-01T10:04:00", "Journals"),
    ans("f", false, "2026-10-01T10:05:00", "Journals"),
  ];
  it("ranks the area missed most often first", () => {
    expect(weakReport(history).areas[0].sub).toBe("Ratios");
  });
  it("puts open misses at the front of the drill", () => {
    const set = weakSet(qs, history, 3).map((q) => q.id);
    expect(set.slice(0, 3).sort()).toEqual(["a", "b", "f"]);
  });
});

describe("nextEndless", () => {
  it("never repeats inside a run and stops when the pool is used up", () => {
    const used = new Set<string>();
    for (let i = 0; i < qs.length; i++) {
      const q = nextEndless(qs, [], used)!;
      expect(used.has(q.id)).toBe(false);
      used.add(q.id);
    }
    expect(nextEndless(qs, [], used)).toBeNull();
  });
});
