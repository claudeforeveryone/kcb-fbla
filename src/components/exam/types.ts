import type { Question } from '../../lib/content';
import type { CustomQuestion } from '../../lib/types';
import { customQuestionId } from '../../lib/types';

/** One multiple-choice question as the runner shows it. */
export type ExamQuestion = {
  /** Official id ("acc-001") or "custom:<testId>:<n>"; this is what the server grades. */
  id: string;
  q: string;
  choices: string[];
  /**
   * Index of the right choice. Needed for instant feedback (practice / endless); the server grades
   * independently either way. Leave undefined in exam mode if you prefer not to ship it.
   */
  answer?: number;
  explain?: string | null;
  sub?: string | null;
  diff?: 1 | 2 | 3 | null;
  event?: string | null;
};

/**
 * practice: instant feedback after each answer, linear.
 * exam: no feedback until the end, free navigation, flags, question navigator, review-before-submit.
 * endless: instant feedback, keeps going until `lives` wrong answers (or the pool runs out).
 */
export type ExamMode = 'practice' | 'exam' | 'endless';

/** What the runner hands to onFinish, in question order (only questions reached, for endless). */
export type RunnerAnswer = {
  question_id: string;
  chosen: number | null;
  ms: number;
  flagged: boolean;
};

export type FinishReason = 'submitted' | 'timeout' | 'out-of-lives' | 'ended' | 'completed';
export type FinishMeta = { durationMs: number; reason: FinishReason };

/** Serializable runner progress, for resuming after a reload. */
export type RunnerSnapshot = {
  index: number;
  chosen: (number | null)[];
  revealed: boolean[];
  flags: boolean[];
  ms: number[];
  /** Epoch ms when the run started. */
  startedAt: number;
  /** Epoch ms when a timed run ends. */
  deadline: number | null;
  /** Endless: how many questions have been drawn so far. */
  reached: number;
};

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Static content question -> runner question. */
export function fromContent(q: Question): ExamQuestion {
  return {
    id: q.id,
    q: q.q,
    choices: q.choices,
    answer: q.answer,
    explain: q.explain,
    sub: q.sub,
    diff: q.diff,
    event: q.topic,
  };
}

/** Chapter custom-test question -> runner question (id as the server expects). */
export function fromCustom(testId: string, index: number, q: CustomQuestion, event: string | null): ExamQuestion {
  return {
    id: customQuestionId(testId, index),
    q: q.q,
    choices: [...q.choices],
    answer: q.answer,
    explain: q.explain ?? null,
    sub: q.sub ?? null,
    diff: null,
    event,
  };
}
