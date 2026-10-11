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

const allBankQuestions = Object.values(files).flatMap((b) => b.questions);

describe("sample questions", () => {
  it("are written for the landing: no id or question from any bank", () => {
    // a visitor sees these keys before joining; if they were bank items, their first rated try would be free points
    for (const s of SAMPLE_QUESTIONS) {
      expect(
        allBankQuestions.find((q) => q.id === s.id),
        s.id,
      ).toBeUndefined();
      const text = s.q.trim().toLowerCase();
      expect(
        allBankQuestions.find((q) => q.q.trim().toLowerCase() === text),
        s.id,
      ).toBeUndefined();
    }
  });

  it("name a real event and one of its real competency areas", () => {
    for (const s of SAMPLE_QUESTIONS) {
      const bank = banks[s.event];
      expect(bank, s.event).toBeDefined();
      expect(s.eventName).toBe(bank.name);
      expect(eventBySlug(s.event)?.name).toBe(bank.name);
      expect(new Set(bank.questions.map((q) => q.sub)).has(s.sub), s.sub).toBe(
        true,
      );
    }
  });

  it("each have four different choices, one keyed answer and an explanation", () => {
    for (const s of SAMPLE_QUESTIONS) {
      expect(s.choices).toHaveLength(4);
      expect(new Set(s.choices).size).toBe(4);
      expect(s.answer).toBeGreaterThanOrEqual(0);
      expect(s.answer).toBeLessThan(4);
      expect(s.explain.length).toBeGreaterThan(40);
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
