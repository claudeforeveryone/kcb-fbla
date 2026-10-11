import { useCallback, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Spinner, useToast } from '../ui';
import { submitAttempt } from '../../api/core';
import { invalidatePlayHistory } from '../../api/play';
import { checkAnswer } from '../../api/keys';
import { useAuth } from '../../lib/auth';
import type { SubmitAttemptInput, SubmitAttemptResult } from '../../lib/types';
import { ExamRunner, type ExamRunnerProps } from './ExamRunner';
import { ExamResults } from './ExamResults';
import { useQuestionReport } from '../feedback/FeedbackDialog';
import { resultFromSubmit, type ExamResultData } from './result';
import type { FinishMeta, RunnerAnswer } from './types';

export type ExamSessionProps = Omit<ExamRunnerProps, 'onFinish' | 'submitting'> & {
  /** Everything fbla_submit_attempt needs except the answers. */
  submit: Omit<SubmitAttemptInput, 'answers' | 'duration_ms'>;
  /** Buttons on the results screen. */
  resultActions?: (result: ExamResultData) => ReactNode;
  /** After the server graded the run (e.g. clear saved progress, update a duel). */
  onSubmitted?: (result: ExamResultData, raw: SubmitAttemptResult, meta: FinishMeta) => void;
  /** Endless: the record before this run. */
  previousBest?: number | null;
};

/** Instant feedback graded by the server (questions ship without their keys). */
async function serverCheck(questionId: string, choice: number | null) {
  const r = await checkAnswer(questionId, choice);
  return { answer: r.correct_choice, explain: r.explain, chosen: r.chosen };
}

/**
 * Runner + submission + animated results in one: run the questions, grade them with fbla_submit_attempt,
 * refresh the member's Elo, and show the results with a per-question review. Arena or chapter pages can use
 * this directly, or compose ExamRunner / ExamResults themselves.
 */
export function ExamSession({ submit, resultActions, onSubmitted, previousBest, ...runner }: ExamSessionProps) {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [phase, setPhase] = useState<'running' | 'submitting' | 'error' | 'done'>('running');
  const [result, setResult] = useState<ExamResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ answers: RunnerAnswer[]; meta: FinishMeta } | null>(null);
  const report = useQuestionReport();

  const send = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    setPhase('submitting');
    setError(null);
    try {
      const raw = await submitAttempt({
        ...submit,
        duration_ms: p.meta.durationMs,
        answers: p.answers.map(({ question_id, chosen, ms }) => ({ question_id, chosen, ms })),
      });
      const data = resultFromSubmit(raw, p.answers, runner.questions, {
        kind: submit.kind,
        event: submit.event ?? null,
        label: submit.label ?? null,
      });
      invalidatePlayHistory();
      void refreshProfile().catch(() => {});
      setResult(data);
      setPhase('done');
      window.scrollTo({ top: 0 });
      onSubmitted?.(data, raw, p.meta);
      if (p.meta.reason === 'timeout') toast.info("Time's up", 'Your answers were submitted automatically.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your results.');
      setPhase('error');
    }
  }, [submit, runner.questions, refreshProfile, onSubmitted, toast]);

  const onFinish = useCallback(
    (answers: RunnerAnswer[], meta: FinishMeta) => {
      if (answers.length === 0) {
        runner.onExit?.();
        return;
      }
      pending.current = { answers, meta };
      void send();
    },
    [send, runner],
  );

  if (phase === 'done' && result)
    return (
      <>
        <ExamResults
          data={result}
          questions={runner.questions}
          actions={resultActions?.(result)}
          previousBest={previousBest}
          animate
          onReport={report.onReport}
        />
        {report.dialog}
      </>
    );

  return (
    <>
      <ExamRunner {...runner} onCheck={runner.onCheck ?? serverCheck} onFinish={onFinish} submitting={phase === 'submitting'} />
      {phase !== 'running' && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-deep/60 p-4" role="dialog" aria-modal="true" aria-live="polite">
          <div className="animate-pop w-full max-w-sm rounded-[2px] border border-line border-t-[3px] border-t-red bg-surface p-6 text-center">
            {phase === 'submitting' ? (
              <>
                <Spinner className="mx-auto size-8 text-blue" />
                <h2 className="mt-4 text-lg font-bold">Grading your answers</h2>
                <p className="mt-1 text-sm text-muted">Checking every answer and updating your Elo.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">We couldn't save that run</h2>
                <p className="mt-1 text-sm text-muted">{error}</p>
                <p className="mt-2 text-sm text-muted">Your answers are still here. Try again when you're back online.</p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button variant="primary" onClick={() => void send()} leftIcon={<RefreshCw className="size-4" />}>
                    Try again
                  </Button>
                  {runner.onExit && (
                    <Button variant="ghost" onClick={runner.onExit}>
                      Leave without saving
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
