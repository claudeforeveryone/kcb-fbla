import { describe, expect, it } from "vitest";
import {
  answerSample,
  isRepeat,
  nextSample,
  ratingNow,
  sampleDelta,
  startSampleRun,
  tryAgain,
  type SampleRun,
} from "./sampleRun";
import { SAMPLE_QUESTIONS } from "./samples";

/** Answers every question in order (right or wrong) and returns the run after the last one. */
function sitPaper(
  run: SampleRun,
  right: boolean,
): { run: SampleRun; deltas: number[] } {
  const deltas: number[] = [];
  let r = run;
  for (let i = 0; i < SAMPLE_QUESTIONS.length; i++) {
    const q = SAMPLE_QUESTIONS[r.index];
    r = answerSample(r, right ? q.answer : (q.answer + 1) % 4);
    deltas.push(sampleDelta(r));
    r = nextSample(r);
  }
  return { run: r, deltas };
}

describe("the sample paper's rating", () => {
  it("starts at 0 and moves on first tries like a new member's (medium +12, hard +18, medium +11)", () => {
    const { run, deltas } = sitPaper(startSampleRun(), true);
    expect(deltas).toEqual([12, 18, 11]);
    expect(Math.round(ratingNow(run))).toBe(41);
  });

  it("treats every question as a repeat after Try again: no Elo either way, the rating is kept", () => {
    const first = sitPaper(startSampleRun(), true);
    const again = tryAgain(first.run);
    expect(again.index).toBe(0);
    expect(again.chosen.every((c) => c === null)).toBe(true);
    expect(isRepeat(again)).toBe(true);
    expect(Math.round(ratingNow(again))).toBe(41);

    const right = sitPaper(again, true);
    expect(right.deltas).toEqual([0, 0, 0]);
    expect(Math.round(ratingNow(right.run))).toBe(41);

    const wrong = sitPaper(tryAgain(right.run), false);
    expect(wrong.deltas).toEqual([0, 0, 0]);
    expect(Math.round(ratingNow(wrong.run))).toBe(41);
  });

  it("only counts a question as a repeat once it has been answered", () => {
    const run = startSampleRun();
    expect(isRepeat(run)).toBe(false);
    expect(isRepeat(nextSample(answerSample(run, 0)))).toBe(false);
  });

  it("ignores a second answer to the same question", () => {
    const once = answerSample(startSampleRun(), SAMPLE_QUESTIONS[0].answer);
    const twice = answerSample(once, 0);
    expect(twice).toBe(once);
  });

  it("keeps a new member's floor: wrong first tries from 0 stay at 0", () => {
    const { run, deltas } = sitPaper(startSampleRun(), false);
    expect(deltas).toEqual([0, 0, 0]);
    expect(ratingNow(run)).toBe(0);
  });
});
