// Student feedback (fbla_feedback, supabase/migrations/0103): validation and wording shared by the "Send feedback"
// dialog and "Report this question" in exam review. The database enforces the same limits.

export type FeedbackKind = 'bug' | 'feature' | 'general' | 'question_issue' | 'resource_issue' | 'accessibility';
export type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wontfix';
export type FeedbackPriority = 'low' | 'normal' | 'high';
/** What Feedback triage lists: open (new, triaged, in progress), one status, or all. */
export type FeedbackFilter = 'open' | 'all' | FeedbackStatus;

/**
 * What "Your reports" reads back: the report, its status and the team's note. Never priority or reviewed_by: 0103
 * grants students select on the other columns only, so asking for either would make the database refuse the read.
 */
export const STUDENT_FEEDBACK_COLUMNS = 'id,kind,message,question_id,status,resolution_note,created_at,updated_at';

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

/**
 * The toast after an owner saves a report in triage: says what changed and who sees it. Status and the note are
 * shown to the student; priority is owners only. `note` is the new note text when it changed ('' when removed).
 */
export function triageSaved(changed: { status?: FeedbackStatus; priority?: FeedbackPriority; note?: string }): {
  title: string;
  body: string;
} {
  const note = changed.note;
  if (changed.status)
    return {
      title: `Marked ${STATUS_LABELS[changed.status]}`,
      body: note ? 'The student sees the new status and your note.' : 'The student sees the new status.',
    };
  if (note !== undefined)
    return note
      ? { title: 'Note saved', body: 'The student sees it with the status.' }
      : { title: 'Note removed', body: 'The student no longer sees a note.' };
  if (changed.priority) {
    const p = changed.priority;
    return { title: `Priority set to ${p.charAt(0).toUpperCase()}${p.slice(1)}`, body: 'Only owners see priority.' };
  }
  return { title: 'Saved', body: 'Nothing changed.' };
}

const FILTERS: readonly string[] = ['open', 'all', 'new', 'triaged', 'in_progress', 'resolved', 'wontfix'];
const QUESTION_ID = /^[A-Za-z0-9_:.-]{1,80}$/;

/**
 * The triage filters in the owner console URL (?status=&kind=&question=), so Content's reported questions and the
 * status counts can open Feedback already filtered. Anything unknown falls back to open reports of any kind.
 */
export function triageFilters(params: URLSearchParams): {
  status: FeedbackFilter;
  kind: FeedbackKind | '';
  question: string | null;
} {
  const status = params.get('status') ?? '';
  const kind = params.get('kind') ?? '';
  const question = params.get('question') ?? '';
  return {
    status: FILTERS.includes(status) ? (status as FeedbackFilter) : 'open',
    kind: Object.hasOwn(KIND_LABELS, kind) ? (kind as FeedbackKind) : '',
    question: QUESTION_ID.test(question) ? question : null,
  };
}

/** A link into Feedback triage: keeps the rest of the console URL (range), replaces any earlier filters. */
export function triageLink(
  current: URLSearchParams | string,
  f: { status?: FeedbackFilter; kind?: FeedbackKind; question?: string },
): string {
  const p = new URLSearchParams(current);
  p.set('tab', 'feedback');
  for (const key of ['status', 'kind', 'question']) p.delete(key);
  if (f.status) p.set('status', f.status);
  if (f.kind) p.set('kind', f.kind);
  if (f.question) p.set('question', f.question);
  return `?${p.toString()}`;
}

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
