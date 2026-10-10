import type { AchievementCode, AnswerRow, Attempt, AttemptKind, SubmitAttemptResult } from '../../lib/types';
import type { ExamQuestion, RunnerAnswer } from './types';

/** One graded answer as the results screen shows it. */
export type ResultAnswer = {
  question_id: string;
  chosen: number | null;
  correct: boolean;
  /** Right choice; from the server on submit, or from content when reviewing later. */
  correct_choice: number | null;
  elo_delta: number;
  ms: number;
  flagged: boolean;
  explain: string | null;
  sub: string | null;
};

/** Everything the results screen needs, from a fresh submission or a stored attempt. */
export type ExamResultData = {
  attemptId: string | null;
  kind: AttemptKind;
  event: string | null;
  label: string | null;
  correct: number;
  total: number;
  durationMs: number;
  eloBefore: number;
  eloAfter: number;
  answers: ResultAnswer[];
  /** Newly earned achievement codes (fresh submissions only). */
  achievements: AchievementCode[];
  createdAt: string | null;
  currentStreak: number | null;
};

const qMap = (qs: ExamQuestion[]) => new Map(qs.map((q) => [q.id, q]));

/** Combine the server's grading with what the runner recorded (flags, per-question time). */
export function resultFromSubmit(
  res: SubmitAttemptResult,
  runner: RunnerAnswer[],
  questions: ExamQuestion[],
  meta: { kind: AttemptKind; event?: string | null; label?: string | null },
): ExamResultData {
  const byQ = qMap(questions);
  return {
    attemptId: res.attempt_id,
    kind: meta.kind,
    event: meta.event ?? null,
    label: meta.label ?? null,
    correct: res.correct,
    total: res.total,
    durationMs: res.duration_ms ?? runner.reduce((s, a) => s + a.ms, 0),
    eloBefore: res.elo_before,
    eloAfter: res.elo_after,
    achievements: res.achievements ?? [],
    createdAt: new Date().toISOString(),
    currentStreak: res.current_streak ?? null,
    answers: res.answers.map((a, i) => {
      const r = runner[i]?.question_id === a.question_id ? runner[i] : runner.find((x) => x.question_id === a.question_id);
      const q = byQ.get(a.question_id);
      return {
        question_id: a.question_id,
        chosen: a.chosen ?? r?.chosen ?? null,
        correct: a.correct,
        correct_choice: a.correct_choice ?? q?.answer ?? null,
        elo_delta: a.elo_delta ?? 0,
        ms: r?.ms ?? 0,
        flagged: r?.flagged ?? false,
        explain: a.explain ?? q?.explain ?? null,
        sub: q?.sub ?? null,
      };
    }),
  };
}

/** A stored attempt (fbla_attempts + fbla_answers) plus question content. */
export function resultFromStored(attempt: Attempt, answers: AnswerRow[], questions: ExamQuestion[]): ExamResultData {
  const byQ = qMap(questions);
  return {
    attemptId: attempt.id,
    kind: attempt.kind,
    event: attempt.event,
    label: attempt.label,
    correct: attempt.correct,
    total: attempt.total,
    durationMs: attempt.duration_ms,
    eloBefore: attempt.elo_before,
    eloAfter: attempt.elo_after,
    achievements: [],
    createdAt: attempt.created_at,
    currentStreak: null,
    answers: answers.map((a) => {
      const q = byQ.get(a.question_id);
      return {
        question_id: a.question_id,
        chosen: a.chosen,
        correct: a.correct,
        correct_choice: q?.answer ?? null,
        elo_delta: a.elo_delta,
        ms: a.ms,
        flagged: false,
        explain: q?.explain ?? null,
        sub: a.sub ?? q?.sub ?? null,
      };
    }),
  };
}

/** Correct / total per competency area, worst first. */
export function areaBreakdown(data: ExamResultData): { sub: string; correct: number; total: number }[] {
  const m = new Map<string, { sub: string; correct: number; total: number }>();
  for (const a of data.answers) {
    const k = a.sub || 'General';
    const r = m.get(k) ?? { sub: k, correct: 0, total: 0 };
    r.total++;
    if (a.correct) r.correct++;
    m.set(k, r);
  }
  return [...m.values()].sort((x, y) => x.correct / x.total - y.correct / y.total || y.total - x.total);
}

/** Headline for a score. */
export function verdict(pct: number, total: number): { title: string; line: string } {
  if (total === 0) return { title: 'No answers', line: 'Nothing was recorded for this run.' };
  if (pct >= 1 && total >= 5) return { title: 'Perfect paper', line: 'Every single one. That is competition form.' };
  if (pct >= 0.9) return { title: 'Outstanding', line: 'Top-of-the-room work. Keep this pace.' };
  if (pct >= 0.75) return { title: 'Strong result', line: 'Solid command of the material. Polish the misses below.' };
  if (pct >= 0.6) return { title: 'Good progress', line: 'You are on track. Review the explanations to lock it in.' };
  if (pct >= 0.4) return { title: 'Building up', line: 'Every miss is a lesson. Read through the review, then try again.' };
  return { title: 'Tough round', line: 'This is how you get better. Study the explanations and redo the misses.' };
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
