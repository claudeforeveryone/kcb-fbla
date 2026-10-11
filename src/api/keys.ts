// Answer keys (supabase/migrations/0014_answer_keys_and_elo.sql). Keys are never shipped with the question text:
// public/content/q/*.json and fbla_questions leave out `answer` and `explain`. A member gets a key
//   - after grading (fbla_submit_attempt / fbla_submit_duel return them),
//   - for instant feedback: checkAnswer(), whose first answer per question is binding for the run that follows,
//   - for questions they already answered, or an attempt they may view: getQuestionKeys(),
//   - as chapter staff building a test: getBankKeys() (those questions stop counting toward the viewer's own Elo).
import { supabase } from '../lib/supabase';
import { toApiError } from './core';

export type QuestionKey = { answer: number; explain: string | null };

export type CheckResult = {
  question_id: string;
  /** The answer the server recorded (the first one sent for this question). */
  chosen: number | null;
  correct: boolean;
  correct_choice: number;
  explain: string | null;
};

/** Grades one answer for instant feedback. The first check of a question is the one that counts. */
export async function checkAnswer(questionId: string, chosen: number | null): Promise<CheckResult> {
  const { data, error } = await supabase.rpc('fbla_check_answer', { p_question_id: questionId, p_chosen: chosen });
  if (error) throw toApiError(error, 'Could not check that answer.');
  return data as CheckResult;
}

/**
 * Keys for questions the caller has answered before, plus (with `attemptId`) every question of an attempt they may
 * view. Ids without access are simply missing from the map.
 */
export async function getQuestionKeys(ids: string[], attemptId?: string | null): Promise<Map<string, QuestionKey>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, QuestionKey>();
  for (let i = 0; i < uniq.length; i += 500) {
    const { data, error } = await supabase.rpc('fbla_question_keys', {
      p_ids: uniq.slice(i, i + 500),
      p_attempt: attemptId ?? null,
    });
    if (error) throw toApiError(error, 'Could not load the answers.');
    for (const [id, k] of Object.entries((data ?? {}) as Record<string, QuestionKey>)) out.set(id, k);
  }
  return out;
}

/** Staff only: every key of one event, for importing official questions into a chapter test. */
export async function getBankKeys(event: string): Promise<Map<string, QuestionKey>> {
  const { data, error } = await supabase.rpc('fbla_question_bank', { p_event: event });
  if (error) throw toApiError(error, 'Could not load the answer key.');
  return new Map(Object.entries((data ?? {}) as Record<string, QuestionKey>));
}

/** Copies keys onto question objects that have an `id` (questions without a key are returned unchanged). */
export function applyKeys<T extends { id: string; answer?: number; explain?: string | null }>(
  qs: T[],
  keys: Map<string, QuestionKey>,
): T[] {
  return qs.map((q) => {
    const k = keys.get(q.id);
    return k ? { ...q, answer: k.answer, explain: k.explain ?? q.explain ?? null } : q;
  });
}
