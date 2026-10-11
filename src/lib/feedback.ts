// Student feedback (fbla_feedback, supabase/migrations/0103): validation and wording shared by the "Send feedback"
// dialog and "Report this question" in exam review. The database enforces the same limits.

export type FeedbackKind = 'bug' | 'feature' | 'general' | 'question_issue' | 'resource_issue' | 'accessibility';
export type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wontfix';
export type FeedbackPriority = 'low' | 'normal' | 'high';

export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 2000;

/** What a student can pick in "Send feedback". Question reports come from the review screen instead. */
export const FEEDBACK_KINDS: { value: Exclude<FeedbackKind, 'question_issue'>; label: string; hint: string }[] = [
  { value: 'bug', label: 'Something is broken', hint: 'A page, button or score that does not work right.' },
  { value: 'feature', label: 'An idea', hint: 'Something you wish the site did.' },
  { value: 'accessibility', label: 'Hard to use or read', hint: 'Contrast, keyboard, screen reader, text size.' },
  { value: 'resource_issue', label: 'A resource or link', hint: 'A chapter post, deck or link that is wrong.' },
  { value: 'general', label: 'Something else', hint: 'Anything you want the team to know.' },
];

export const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Bug',
  feature: 'Idea',
  general: 'General',
  question_issue: 'Question report',
  resource_issue: 'Resource',
  accessibility: 'Accessibility',
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wontfix: "Won't fix",
};

/** Null when the message can be sent, otherwise what to fix. */
export function feedbackProblem(message: string): string | null {
  const n = message.trim().length;
  if (n < FEEDBACK_MIN) return 'Add a few words so the team knows what happened.';
  if (n > FEEDBACK_MAX) return 'Keep it under 2,000 characters.';
  return null;
}

/** The page a report came from: path only (no query or hash, which can carry ids), at most 200 characters. */
export function cleanPagePath(path: string): string {
  const bare = path.split(/[?#]/)[0].replace(/\s+/g, '');
  return (bare.startsWith('/') ? bare : `/${bare}`).slice(0, 200);
}

export const REPORT_REASONS = [
  { value: 'wrong_key', label: 'Wrong answer marked correct' },
  { value: 'unclear', label: 'The question is unclear' },
  { value: 'typo', label: 'Typo or formatting problem' },
  { value: 'explanation', label: 'The explanation is wrong' },
  { value: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** The report message: the chosen reason, then the student's own words when they added any. */
export function composeReport(reason: ReportReason, details: string): string {
  const label = REPORT_REASONS.find((r) => r.value === reason)?.label ?? 'Something else';
  const extra = details.trim();
  return extra ? `${label}: ${extra}` : label;
}

/** Official questions only: chapter-written questions (custom:...) belong to their author, not the site team. */
export function canReportQuestion(questionId: string): boolean {
  return !!questionId && !questionId.startsWith('custom:');
}
