import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Flag,
  Grid3x3,
  Heart,
  HelpCircle,
  LogOut,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { Badge, Button, CountdownTimer, Kbd, Modal, cn } from '../ui';
import { DIFFICULTY_LABELS } from '../../lib/types';
import { ExamStyles } from './ExamStyles';
import {
  LETTERS,
  type ExamMode,
  type ExamQuestion,
  type FinishMeta,
  type RunnerAnswer,
  type RunnerKey,
  type RunnerSnapshot,
} from './types';

export type ExamRunnerProps = {
  questions: ExamQuestion[];
  mode: ExamMode;
  /** Whole-run time limit; the run submits itself when it runs out. */
  timeLimitSec?: number;
  onFinish: (answers: RunnerAnswer[], meta: FinishMeta) => void;
  /** Shown in the toolbar. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Endless: wrong answers allowed (default 3). */
  lives?: number;
  /** Endless: the record to beat, shown in the toolbar. */
  best?: number | null;
  /** Called after the member confirms leaving without submitting. Omit to hide the exit button. */
  onExit?: () => void;
  /** Resume from a saved snapshot (must match `questions`). */
  initialState?: RunnerSnapshot | null;
  /** Fires on every change, for persisting progress. */
  onSnapshot?: (s: RunnerSnapshot) => void;
  /** Shows the submit button busy (while the parent submits). */
  submitting?: boolean;
  /** Hide the question navigator even in exam mode (e.g. Arena). */
  hideNavigator?: boolean;
  /**
   * Instant modes: grades one answer when the question carries no key (keys are not shipped with the questions).
   * The server records the first answer per question, so the returned `chosen` wins over the local one.
   */
  onCheck?: (questionId: string, choice: number | null) => Promise<RunnerKey & { chosen?: number | null }>;
  className?: string;
};

function freshState(n: number, timeLimitSec?: number): RunnerSnapshot {
  const now = Date.now();
  return {
    index: 0,
    chosen: Array(n).fill(null),
    revealed: Array(n).fill(false),
    flags: Array(n).fill(false),
    ms: Array(n).fill(0),
    startedAt: now,
    deadline: timeLimitSec ? now + timeLimitSec * 1000 : null,
    reached: 1,
  };
}

function validSnapshot(s: RunnerSnapshot | null | undefined, n: number): s is RunnerSnapshot {
  return !!s && Array.isArray(s.chosen) && s.chosen.length === n && s.index >= 0 && s.index < n;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The shared exam runner (Play, Arena, chapter tests, Career redo). Pure UI: it never talks to the server.
 * Keyboard: 1-4 or A-D pick, Enter confirms / next, arrows move (exam), F flags (exam).
 */
export function ExamRunner({
  questions: rawQuestions,
  mode,
  timeLimitSec,
  onFinish,
  title,
  subtitle,
  lives = 3,
  best,
  onExit,
  initialState,
  onSnapshot,
  submitting,
  hideNavigator,
  onCheck,
  className,
}: ExamRunnerProps) {
  // keys fetched for instant feedback (fbla_check_answer), merged onto the questions that arrived without one
  const [keys, setKeys] = useState<Record<string, RunnerKey>>(() => ({ ...(initialState?.keys ?? {}) }));
  const questions = useMemo(
    () =>
      rawQuestions.map((q) => {
        const k = q.answer === undefined ? keys[q.id] : undefined;
        return k ? { ...q, answer: k.answer, explain: k.explain ?? q.explain ?? null } : q;
      }),
    [rawQuestions, keys],
  );
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const n = questions.length;
  const [s, setS] = useState<RunnerSnapshot>(() =>
    validSnapshot(initialState, n) ? initialState : freshState(n, timeLimitSec),
  );
  const [navOpen, setNavOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const finished = useRef(false);
  const enteredAt = useRef(Date.now());

  const instant = mode !== 'exam';
  const q = questions[s.index];
  const chosen = s.chosen[s.index];
  const revealed = s.revealed[s.index];

  const wrongCount = useMemo(
    () => s.revealed.reduce((acc, r, i) => acc + (r && s.chosen[i] !== questions[i].answer ? 1 : 0), 0),
    [s.revealed, s.chosen, questions],
  );
  const rightCount = useMemo(
    () => s.revealed.reduce((acc, r, i) => acc + (r && s.chosen[i] === questions[i].answer ? 1 : 0), 0),
    [s.revealed, s.chosen, questions],
  );
  const answeredCount = useMemo(() => s.chosen.filter((c) => c != null).length, [s.chosen]);
  const flaggedCount = useMemo(() => s.flags.filter(Boolean).length, [s.flags]);
  const streak = useMemo(() => {
    let k = 0;
    for (let i = s.index; i >= 0; i--) {
      if (!s.revealed[i]) continue;
      if (s.chosen[i] === questions[i].answer) k++;
      else break;
    }
    return k;
  }, [s.index, s.revealed, s.chosen, questions]);
  const livesLeft = Math.max(0, lives - wrongCount);
  const outOfLives = mode === 'endless' && livesLeft === 0;

  useEffect(() => {
    onSnapshot?.(Object.keys(keys).length ? { ...s, keys } : s);
  }, [s, keys, onSnapshot]);

  const sRef = useRef(s);
  sRef.current = s;

  // Time on the current question: banked when leaving it (and frozen once revealed in instant modes).
  const bank = useCallback(
    (st: RunnerSnapshot): RunnerSnapshot => {
      const now = Date.now();
      const dt = now - enteredAt.current;
      enteredAt.current = now;
      if (instant && st.revealed[st.index]) return st;
      const ms = [...st.ms];
      ms[st.index] += dt;
      return { ...st, ms };
    },
    [instant],
  );

  const finish = useCallback(
    (reason: FinishMeta['reason']) => {
      if (finished.current) return;
      finished.current = true;
      const st = bank(sRef.current);
      setS(st);
      const answers: RunnerAnswer[] = [];
      for (let i = 0; i < n; i++) {
        // practice/endless: only questions actually answered count
        if (instant && !st.revealed[i]) continue;
        answers.push({ question_id: questions[i].id, chosen: st.chosen[i], ms: st.ms[i], flagged: st.flags[i] });
      }
      onFinish(answers, { durationMs: Date.now() - st.startedAt, reason });
    },
    [bank, instant, n, onFinish, questions],
  );

  const go = useCallback(
    (to: number) => {
      const prev = sRef.current;
      if (to < 0 || to >= n || to === prev.index) return;
      const st = bank(prev);
      setS({ ...st, index: to, reached: Math.max(st.reached, to + 1) });
    },
    [bank, n],
  );

  const pick = useCallback(
    (choice: number | null) => {
      if (finished.current || submitting || checkingRef.current) return;
      const prev = sRef.current;
      const i = prev.index;
      if (instant && prev.revealed[i]) return;
      if (!instant && choice == null) return;
      if (instant && questions[i].answer === undefined && onCheck) {
        // no key on the client: the server grades it (and remembers this first answer)
        const qid = questions[i].id;
        const st0 = bank(prev);
        setS(st0);
        checkingRef.current = true;
        setChecking(true);
        setCheckError(null);
        onCheck(qid, choice)
          .then((res) => {
            setKeys((k) => ({ ...k, [qid]: { answer: res.answer, explain: res.explain ?? null } }));
            const picked = res.chosen !== undefined ? res.chosen : choice;
            if (picked !== res.answer) setShakeKey((k) => k + 1);
            setS((cur) => {
              const c = [...cur.chosen];
              c[i] = picked;
              const r = [...cur.revealed];
              r[i] = true;
              return { ...cur, chosen: c, revealed: r };
            });
          })
          .catch((e: unknown) => setCheckError(e instanceof Error ? e.message : 'Could not check that answer.'))
          .finally(() => {
            checkingRef.current = false;
            setChecking(false);
          });
        return;
      }
      const st = instant ? bank(prev) : prev;
      const c = [...st.chosen];
      c[i] = !instant && c[i] === choice ? null : choice; // exam: clicking the same choice clears it
      let r = st.revealed;
      if (instant) {
        r = [...st.revealed];
        r[i] = true;
        if (choice !== questions[i].answer) setShakeKey((k) => k + 1);
      }
      setS({ ...st, chosen: c, revealed: r });
    },
    [bank, instant, questions, submitting, onCheck],
  );

  const toggleFlag = useCallback(() => {
    const prev = sRef.current;
    const f = [...prev.flags];
    f[prev.index] = !f[prev.index];
    setS({ ...prev, flags: f });
  }, []);

  const next = useCallback(() => {
    if (instant) {
      if (!revealed) return;
      if (outOfLives) return finish('out-of-lives');
      if (s.index >= n - 1) return finish('completed');
      go(s.index + 1);
    } else {
      if (s.index >= n - 1) setReviewOpen(true);
      else go(s.index + 1);
    }
  }, [instant, revealed, outOfLives, s.index, n, finish, go]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || finished.current) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4', '5', '6'].indexOf(k) >= 0 ? Number(k) - 1 : ['a', 'b', 'c', 'd', 'e', 'f'].indexOf(k);
      if (k === 'f' && mode === 'exam') {
        e.preventDefault();
        toggleFlag();
        return;
      }
      if (idx >= 0 && idx < (q?.choices.length ?? 0) && !(k === 'f')) {
        e.preventDefault();
        pick(idx);
        return;
      }
      if (k === 'enter') {
        const el = document.activeElement;
        if (el instanceof HTMLButtonElement && !el.dataset.choice) return; // let focused buttons work
        e.preventDefault();
        next();
        return;
      }
      if (mode === 'exam' && k === 'arrowright') {
        e.preventDefault();
        go(s.index + 1);
      }
      if (mode === 'exam' && k === 'arrowleft') {
        e.preventDefault();
        go(s.index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, q, pick, next, go, toggleFlag, s.index]);

  // warn before closing the tab mid-run
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!finished.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // keep the question in view on change
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.top > window.innerHeight * 0.5) window.scrollTo({ top: window.scrollY + r.top - 140, behavior: 'smooth' });
  }, [s.index]);

  if (!q) return null;

  const progressValue = mode === 'endless' ? rightCount : instant ? s.revealed.filter(Boolean).length : answeredCount;
  const isLast = s.index === n - 1;
  const showNav = mode === 'exam' && !hideNavigator;
  const remainingSec = s.deadline ? (s.deadline - Date.now()) / 1000 : undefined;

  return (
    <div className={cn('relative', className)}>
      <ExamStyles />
      {/* toolbar */}
      <div className="sticky top-16 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] lg:px-10 items-center gap-3 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold text-heading">{title}</div>
            {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
          </div>

          {mode === 'endless' ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5" aria-label={`${livesLeft} of ${lives} lives left`}>
                {Array.from({ length: lives }, (_, i) => (
                  <Heart
                    key={i + (i >= livesLeft ? `-x${wrongCount}` : '')}
                    className={cn(
                      'size-5 transition-colors',
                      i < livesLeft ? 'fill-red text-red' : 'exam-heart fill-surface-3 text-line-strong',
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="tabular font-display text-lg font-extrabold text-heading" aria-label={`${rightCount} correct`}>
                {rightCount}
              </span>
              {best != null && best > 0 && (
                <span className="hidden text-xs text-muted sm:inline">best {best}</span>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="tabular text-sm font-semibold text-muted">
                {mode === 'exam' ? `${answeredCount}/${n} answered` : `${rightCount}/${s.revealed.filter(Boolean).length} right`}
              </span>
            </div>
          )}

          {s.deadline && (
            <CountdownTimer
              until={s.deadline}
              warnAt={Math.min(300, Math.max(30, (timeLimitSec ?? 600) * 0.1))}
              dangerAt={30}
              onExpire={() => finish('timeout')}
            />
          )}
          {showNav && (
            <Button
              variant="outline"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Question navigator"
              onClick={() => setNavOpen(true)}
            >
              <Grid3x3 className="size-4" />
            </Button>
          )}
          {onExit && (
            <Button variant="ghost" size="icon-sm" aria-label="Leave run" onClick={() => setExitOpen(true)}>
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
        {mode !== 'endless' && (
          <div className="h-1 w-full bg-surface-3">
            <div
              className="h-full bg-blue transition-[width] duration-300 ease-out"
              style={{ width: `${(progressValue / Math.max(1, n)) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-[1440px] lg:px-10 gap-6 px-4 pb-6 pt-5 sm:px-6 md:pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className={cn('min-w-0', !showNav && 'lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-3xl')}>
          <div ref={topRef} key={s.index} className="exam-slide">
            {/* question meta */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-muted">
                {mode === 'endless' ? `Question ${s.index + 1}` : `Question ${s.index + 1} of ${n}`}
              </span>
              {q.sub && <Badge tone="blue" className="max-w-full truncate">{q.sub}</Badge>}
              {q.diff && (
                <Badge tone={q.diff === 3 ? 'red' : q.diff === 1 ? 'success' : 'neutral'}>{DIFFICULTY_LABELS[q.diff]}</Badge>
              )}
              {instant && streak >= 3 && (
                <Badge tone="warning" className="exam-pop">
                  {streak} in a row
                </Badge>
              )}
              {mode === 'exam' && s.flags[s.index] && (
                <Badge tone="red">
                  <Flag className="size-3" /> Flagged
                </Badge>
              )}
            </div>

            <h2 className="mb-5 whitespace-pre-line text-[1.2rem] font-bold leading-snug text-heading md:text-[1.4rem]">
              {q.q}
            </h2>

            <div
              key={`c-${shakeKey}`}
              className={cn('grid gap-2.5', instant && revealed && chosen !== q.answer && shakeKey > 0 && 'exam-shake')}
              role={instant ? 'group' : 'radiogroup'}
              aria-label="Choices"
            >
              {q.choices.map((c, i) => {
                const isChosen = chosen === i;
                const isRight = q.answer === i;
                const state = instant && revealed ? (isRight ? 'right' : isChosen ? 'wrong' : 'dim') : isChosen ? 'chosen' : 'idle';
                return (
                  <button
                    key={i}
                    type="button"
                    data-choice="1"
                    role={instant ? undefined : 'radio'}
                    aria-checked={instant ? undefined : isChosen}
                    aria-pressed={instant ? isChosen : undefined}
                    disabled={(instant && revealed) || submitting || checking}
                    onClick={() => pick(i)}
                    className={cn(
                      'group flex w-full items-start gap-3 rounded-[4px] border px-3.5 py-3 text-left transition-[border-color,background-color,opacity] duration-150 ease-out md:px-4 md:py-3.5',
                      'disabled:cursor-default',
                      state === 'idle' &&
                        'border-line bg-surface hover:border-blue/60 hover:bg-surface-2',
                      state === 'chosen' && 'border-navy bg-navy/[0.05] ring-2 ring-navy/80 dark:border-link dark:bg-blue/15 dark:ring-link/70',
                      state === 'right' && 'border-success bg-success/10 ring-1 ring-success/50',
                      state === 'wrong' && 'border-red bg-red/[0.07] ring-1 ring-red/40',
                      state === 'dim' && 'border-line bg-surface opacity-55',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-px grid size-7 shrink-0 place-items-center rounded-[2px] font-display text-sm font-bold transition-colors',
                        state === 'idle' && 'bg-surface-2 text-muted ring-1 ring-inset ring-line group-hover:bg-blue/10 group-hover:text-blue',
                        state === 'chosen' && 'bg-surface text-navy ring-2 ring-inset ring-navy dark:text-link dark:ring-link',
                        state === 'right' && 'exam-pop bg-success text-white',
                        state === 'wrong' && 'exam-pop bg-red text-white',
                        state === 'dim' && 'bg-surface-2 text-muted',
                      )}
                      aria-hidden
                    >
                      {state === 'right' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : LETTERS[i]}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 text-[0.975rem] leading-snug text-ink">{c}</span>
                    <span className="sr-only">
                      {state === 'right' ? '(correct answer)' : state === 'wrong' ? '(your answer, incorrect)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {instant && !revealed && (checking || checkError) && (
              <p className={cn('mt-3 text-sm', checkError ? 'font-semibold text-danger' : 'text-muted')} role="status">
                {checkError ? `${checkError} Pick again to retry.` : 'Checking your answer...'}
              </p>
            )}

            {/* instant feedback */}
            {instant && revealed && (
              <div
                className={cn(
                  'exam-rise mt-4 rounded-[4px] border p-4',
                  chosen === q.answer ? 'border-success/30 bg-success/[0.06]' : 'border-red/25 bg-red/[0.04]',
                )}
                role="status"
              >
                <div className="flex items-center gap-2 font-display font-bold">
                  {chosen === q.answer ? (
                    <>
                      <CheckCircle2 className="size-5 text-success" />
                      <span className="text-success">{streak >= 5 ? `Correct. ${streak} straight!` : 'Correct'}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="size-5 text-red dark:text-danger" />
                      <span className="text-red dark:text-danger">
                        {chosen == null ? 'Skipped.' : 'Not quite.'} The answer is {LETTERS[q.answer ?? 0]}.
                      </span>
                      {mode === 'endless' && (
                        <span className="ml-auto text-xs font-semibold text-muted">
                          {livesLeft === 0 ? 'Out of lives' : `${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {q.explain && (
                  <p className="mt-2 text-sm leading-relaxed text-ink/90">
                    <span>{q.explain}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* actions */}
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-line bg-bg px-4 py-3 sm:mx-0 sm:rounded-[2px] sm:border sm:bg-surface md:bottom-4">
            {instant ? (
              <div className="flex items-center gap-2">
                {!revealed ? (
                  <>
                    <Button variant="ghost" size="md" onClick={() => pick(null)} leftIcon={<HelpCircle className="size-4" />}>
                      I don't know
                    </Button>
                    <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted sm:flex">
                      Press <Kbd>1</Kbd>-<Kbd>{Math.min(4, q.choices.length)}</Kbd> to answer
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                      <Kbd>Enter</Kbd> to continue
                    </span>
                    <Button
                      className="ml-auto"
                      variant={outOfLives || isLast ? 'accent' : 'primary'}
                      onClick={next}
                      loading={submitting}
                      rightIcon={<ArrowRight className="size-4" />}
                      autoFocus
                    >
                      {outOfLives ? 'See your run' : isLast ? 'See results' : 'Next question'}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => go(s.index - 1)}
                  disabled={s.index === 0}
                  aria-label="Previous question"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Button
                  variant={s.flags[s.index] ? 'secondary' : 'ghost'}
                  onClick={toggleFlag}
                  leftIcon={<Flag className={cn('size-4', s.flags[s.index] && 'fill-current')} />}
                  aria-pressed={s.flags[s.index]}
                >
                  <span className="hidden sm:inline">{s.flags[s.index] ? 'Flagged' : 'Flag for review'}</span>
                  <span className="sm:hidden">Flag</span>
                </Button>
                <span className="mx-auto hidden items-center gap-1.5 text-xs text-muted xl:flex">
                  <Kbd>1</Kbd>-<Kbd>4</Kbd> pick <Kbd>F</Kbd> flag <Kbd>Enter</Kbd> next
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {!isLast && (
                    <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setReviewOpen(true)}>
                      Submit
                    </Button>
                  )}
                  <Button
                    variant={isLast ? 'accent' : 'primary'}
                    onClick={next}
                    rightIcon={isLast ? <Send className="size-4" /> : <ArrowRight className="size-4" />}
                  >
                    {isLast ? 'Review & submit' : 'Next'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {mode === 'endless' && !revealed && (
            <div className="mt-3 text-center">
              <button
                type="button"
                className="link text-sm"
                onClick={() => (s.revealed.some(Boolean) ? finish('ended') : setExitOpen(true))}
              >
                End run now
              </button>
            </div>
          )}
        </div>

        {showNav && (
          <aside className="hidden lg:block">
            <div className="sticky top-[136px] rounded-[2px] border border-line bg-surface p-4">
              <Navigator s={s} n={n} onGo={go} />
              <Button block variant="accent" className="mt-4" onClick={() => setReviewOpen(true)} leftIcon={<Send className="size-4" />}>
                Review & submit
              </Button>
            </div>
          </aside>
        )}
      </div>

      {showNav && (
        <Modal open={navOpen} onClose={() => setNavOpen(false)} title="Questions" size="md">
          <Navigator
            s={s}
            n={n}
            onGo={(i) => {
              go(i);
              setNavOpen(false);
            }}
          />
        </Modal>
      )}

      {mode === 'exam' && (
        <Modal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          title="Submit your exam?"
          description={
            answeredCount < n
              ? `You have ${n - answeredCount} unanswered ${n - answeredCount === 1 ? 'question' : 'questions'}. Unanswered questions count as wrong.`
              : 'Every question has an answer. Nice.'
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setReviewOpen(false)}>
                Keep working
              </Button>
              <Button
                variant="accent"
                loading={submitting}
                onClick={() => {
                  setReviewOpen(false);
                  finish('submitted');
                }}
                leftIcon={<Send className="size-4" />}
                data-autofocus
              >
                Submit {n} answers
              </Button>
            </>
          }
        >
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <SummaryTile label="Answered" value={answeredCount} tone="navy" />
            <SummaryTile label="Blank" value={n - answeredCount} tone={n - answeredCount ? 'red' : 'muted'} />
            <SummaryTile label="Flagged" value={flaggedCount} tone={flaggedCount ? 'warning' : 'muted'} />
          </div>
          {remainingSec != null && remainingSec > 60 && (
            <p className="mb-3 text-sm text-muted">
              You still have about {Math.floor(remainingSec / 60)} minutes. Jump back to a flagged or blank question below.
            </p>
          )}
          <Navigator
            s={s}
            n={n}
            onGo={(i) => {
              go(i);
              setReviewOpen(false);
            }}
          />
        </Modal>
      )}

      <Modal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Leave this run?"
        description={
          instant && s.revealed.some(Boolean)
            ? 'You can save what you have answered so far, or leave without saving.'
            : 'Your answers will not be saved and nothing changes on your record.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExitOpen(false)}>
              Keep going
            </Button>
            {instant && s.revealed.some(Boolean) && (
              <Button
                variant="primary"
                onClick={() => {
                  setExitOpen(false);
                  finish('ended');
                }}
              >
                Save and finish
              </Button>
            )}
            {onExit && (
              <Button
                variant="danger"
                onClick={() => {
                  finished.current = true;
                  setExitOpen(false);
                  onExit();
                }}
              >
                Leave without saving
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'navy' | 'red' | 'warning' | 'muted' }) {
  return (
    <div className="rounded-[4px] border border-line bg-surface-2 px-2 py-2.5">
      <div
        className={cn(
          'tabular font-display text-2xl font-extrabold',
          tone === 'navy' && 'text-heading',
          tone === 'red' && 'text-red dark:text-danger',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-muted',
        )}
      >
        {value}
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function Navigator({ s, n, onGo }: { s: RunnerSnapshot; n: number; onGo: (i: number) => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[1px] border border-navy/40 bg-navy/10 dark:border-link/50 dark:bg-blue/25" /> Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[1px] border border-line-strong bg-surface" /> Blank
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red" /> Flagged
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-6" role="list">
        {Array.from({ length: n }, (_, i) => {
          const done = s.chosen[i] != null;
          const cur = i === s.index;
          return (
            <button
              key={i}
              type="button"
              role="listitem"
              onClick={() => onGo(i)}
              aria-label={`Question ${i + 1}${done ? ', answered' : ', blank'}${s.flags[i] ? ', flagged' : ''}`}
              aria-current={cur ? 'step' : undefined}
              className={cn(
                'tabular relative grid h-8 place-items-center rounded-[2px] text-xs font-bold transition-colors',
                done
                  ? 'border border-navy/40 bg-navy/10 text-navy hover:bg-navy/15 dark:border-link/50 dark:bg-blue/25 dark:text-link'
                  : 'border border-line-strong bg-surface text-muted hover:border-blue hover:text-heading',
                cur && 'ring-2 ring-red ring-offset-2 ring-offset-surface',
              )}
            >
              {i + 1}
              {s.flags[i] && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-red" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
