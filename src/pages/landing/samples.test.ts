import { describe, expect, it } from "vitest";
import { replayElo } from "../../lib/elo";
import { SAMPLE_QUESTIONS } from "./samples";
import { eventBySlug } from "./observatoryEvents";

type BankQuestion = {
  id: string;
  q: string;
  choices: string[];
  answer: number;
  explain: string;
  sub: string;
  diff: number;
};
type Bank = { slug: string; name: string; questions: BankQuestion[] };

const files = import.meta.glob("../../../content/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Bank>;
const banks: Record<string, Bank> = Object.fromEntries(
  Object.values(files).map((b) => [b.slug, b]),
);

describe("sample questions", () => {
  it("are word for word the items in their banks, keys included", () => {
    for (const s of SAMPLE_QUESTIONS) {
      const bank = banks[s.event];
      expect(bank, s.event).toBeDefined();
      expect(s.eventName).toBe(bank.name);
      expect(eventBySlug(s.event)?.name).toBe(bank.name);
      const q = bank.questions.find((x) => x.id === s.id);
      expect(q, s.id).toBeDefined();
      expect(s.q).toBe(q!.q);
      expect(s.choices).toEqual(q!.choices);
      expect(s.answer).toBe(q!.answer);
      expect(s.explain).toBe(q!.explain);
      expect(s.sub).toBe(q!.sub);
      expect(s.diff).toBe(q!.diff);
    }
  });

  it("come from three different events", () => {
    expect(new Set(SAMPLE_QUESTIONS.map((s) => s.event)).size).toBe(
      SAMPLE_QUESTIONS.length,
    );
  });

  it("move a new member (rating 0) the way the server would on first tries", () => {
    // all right: medium +12, hard +18 (from 12), medium +11
    const right = replayElo(
      0,
      SAMPLE_QUESTIONS.map((s) => ({
        questionId: s.id,
        diff: s.diff,
        correct: true,
      })),
    );
    expect(right.deltas).toEqual([12, 18, 11]);
    // all wrong: the floor keeps the rating at 0
    const wrong = replayElo(
      0,
      SAMPLE_QUESTIONS.map((s) => ({
        questionId: s.id,
        diff: s.diff,
        correct: false,
      })),
    );
    expect(wrong.final).toBe(0);
  });
});
