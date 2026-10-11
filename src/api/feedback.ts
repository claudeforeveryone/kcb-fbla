// Student feedback and question reports (fbla_feedback, supabase/migrations/0103). Students insert their own rows
// and read their own rows back (status and the team's note, never the priority owners set); RLS and column grants
// enforce both. The database also rate-limits submissions (10 an hour, 40 a day).
import { supabase } from '../lib/supabase';
import {
  cleanPagePath,
  feedbackProblem,
  STUDENT_FEEDBACK_COLUMNS,
  type FeedbackKind,
  type FeedbackStatus,
} from '../lib/feedback';
import { ApiError, toApiError } from './core';

export type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  message: string;
  question_id: string | null;
  status: FeedbackStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};


export async function sendFeedback(input: {
  kind: FeedbackKind;
  message: string;
  pagePath?: string | null;
  questionId?: string | null;
}): Promise<void> {
  const problem = feedbackProblem(input.message);
  if (problem) throw new ApiError(problem);
  const { error } = await supabase.from('fbla_feedback').insert({
    kind: input.kind,
    message: input.message.trim(),
    page_path: input.pagePath ? cleanPagePath(input.pagePath) : null,
    question_id: input.kind === 'question_issue' ? (input.questionId ?? null) : null,
  });
  if (error?.code === '53400') throw new ApiError("You've sent a lot of reports today. Try again later.", '53400');
  if (error) throw toApiError(error, 'Could not send that. Try again.');
}

/** The caller's own reports, newest first. */
export async function listMyFeedback(limit = 20): Promise<MyFeedback[]> {
  const { data, error } = await supabase
    .from('fbla_feedback')
    .select(STUDENT_FEEDBACK_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<MyFeedback[]>();
  if (error) throw toApiError(error, 'Could not load your reports.');
  return data ?? [];
}
