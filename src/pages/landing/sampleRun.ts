// The landing's sample paper as plain state, so its rating follows the app's Elo rule exactly (src/lib/elo.ts): a
// sample rating that starts at 0 like a new member's, and moves only on a first try. Once a question has been
// answered its key has been shown, so after "Try again" every question is a repeat: the rating is kept and no answer
// moves it, the same as a question you have seen before in the app.
import { nextRatingExact } from "../../lib/elo";
import { SAMPLE_QUESTIONS } from "./samples";

export type SampleRun = {
  /** the question on screen; SAMPLE_QUESTIONS.length once the paper is done */
  index: number;
  /** this pass's answer to each question */
  chosen: Array<number | null>;
  /** unrounded rating before this pass, then after each answer in it */
  ratings: number[];
  /** ids answered in an earlier pass (their keys have been shown) */
  seen: readonly string[];
};

export function startSampleRun(): SampleRun {
  return {
    index: 0,
    chosen: SAMPLE_QUESTIONS.map(() => null),
    ratings: [0],
    seen: [],
  };
}

/** The unrounded sample rating now. */
export function ratingNow(run: SampleRun): number {
  return run.ratings[run.ratings.length - 1];
}

/** The question on screen was answered in an earlier pass, so it cannot move the rating. */
export function isRepeat(run: SampleRun): boolean {
  const q = SAMPLE_QUESTIONS[run.index];
  return !!q && run.seen.includes(q.id);
}

export function answerSample(run: SampleRun, choice: number): SampleRun {
  const q = SAMPLE_QUESTIONS[run.index];
  if (!q || run.chosen[run.index] !== null) return run;
  const chosen = [...run.chosen];
  chosen[run.index] = choice;
  const after = nextRatingExact(
    ratingNow(run),
    q.diff,
    choice === q.answer,
    !isRepeat(run),
  );
  return { ...run, chosen, ratings: [...run.ratings, after] };
}

/** The shown change from the answer to the question on screen (0 before it is answered). */
export function sampleDelta(run: SampleRun): number {
  const after = run.ratings[run.index + 1];
  if (after === undefined) return 0;
  return Math.round(after) - Math.round(run.ratings[run.index]);
}

export function nextSample(run: SampleRun): SampleRun {
  return { ...run, index: run.index + 1 };
}

/** Back to question one, keeping the rating; every question answered so far is now a repeat. */
export function tryAgain(run: SampleRun): SampleRun {
  const answered = SAMPLE_QUESTIONS.filter((_, i) => run.chosen[i] !== null);
  return {
    index: 0,
    chosen: SAMPLE_QUESTIONS.map(() => null),
    ratings: [ratingNow(run)],
    seen: [...new Set([...run.seen, ...answered.map((q) => q.id)])],
  };
}
