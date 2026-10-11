import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, History, Keyboard, ListRestart, Play, RotateCcw } from 'lucide-react';
import { Button, ButtonLink, ErrorState, Kbd, Skeleton, cn } from '../../components/ui';
import { FacetArt } from '../../components/ui/PageHeader';
import { ExamSession, type ExamResultData, type RunnerSnapshot } from '../../components/exam';
import { useProfile } from '../../lib/auth';
import { buildRun, RunBlocked, type BuiltRun } from './buildRun';
import { track } from '../../api/track';
import { parseRunSpec, runHref } from './runLogic';

type Saved = { run: BuiltRun; snap: RunnerSnapshot | null; savedAt: number };
const STORE = 'kcbfbla:run:';
const MAX_AGE = 6 * 3600_000;

function readSaved(key: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORE + key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!s?.run?.questions?.length || Date.now() - s.savedAt > MAX_AGE) return null;
    // a timed run whose clock already ran out can't be resumed
    if (s.snap?.deadline && s.snap.deadline < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}
function writeSaved(key: string, s: Saved | null) {
  try {
    if (s) sessionStorage.setItem(STORE + key, JSON.stringify(s));
    else sessionStorage.removeItem(STORE + key);
  } catch {
    /* storage full or blocked: resuming is a nicety */
  }
}

export default function RunPage() {
  const loc = useLocation();
  // location.key changes on "Play again", which rebuilds a fresh set
  return <Run key={loc.key} />;
}

function Run() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const spec = useMemo(() => parseRunSpec(params), [params]);
  const storeKey = params.toString();

  const [state, setState] = useState<
    | { s: 'loading' }
    | { s: 'blocked'; title: string; detail: string; action: { to: string; label: string } | null }
    | { s: 'error'; error: unknown }
    | { s: 'intro'; run: BuiltRun; resume: Saved | null }
    | { s: 'running'; run: BuiltRun; snap: RunnerSnapshot | null }
  >({ s: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const saved = readSaved(storeKey);
    setState({ s: 'loading' });
    buildRun(spec, profile)
      .then((run) => live && setState({ s: 'intro', run, resume: saved }))
      .catch((e) => {
        if (!live) return;
        if (saved) setState({ s: 'intro', run: saved.run, resume: saved });
        else if (e instanceof RunBlocked) setState({ s: 'blocked', title: e.message, detail: e.detail, action: e.action });
        else setState({ s: 'error', error: e });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, attempt]);

  const start = useCallback((run: BuiltRun, snap: RunnerSnapshot | null) => {
    setState({ s: 'running', run, snap });
    if (!snap) void track('practice_started', run.submit.event, { mode: run.submit.kind });
    window.scrollTo({ top: 0 });
  }, []);

  const runRef = useRef<BuiltRun | null>(null);
  if (state.s === 'running') runRef.current = state.run;
  const finishedRef = useRef(false);
  const onSnapshot = useCallback(
    (snap: RunnerSnapshot) => {
      if (runRef.current && !finishedRef.current) writeSaved(storeKey, { run: runRef.current, snap, savedAt: Date.now() });
    },
    [storeKey],
  );

  if (state.s === 'loading') return <IntroSkeleton />;
  if (state.s === 'error')
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <ErrorState title="Couldn't build this run" error={state.error} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  if (state.s === 'blocked')
    return (
      <Shell>
        <div className="animate-rise mx-auto max-w-lg rounded-[4px] border border-line bg-surface p-6 text-center md:p-8">
          <h1 className="text-2xl font-extrabold">{state.title}</h1>
          <p className="mt-2 text-muted">{state.detail}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {state.action && (
              <ButtonLink to={state.action.to} variant="primary" rightIcon={<ArrowRight className="size-4" />}>
                {state.action.label}
              </ButtonLink>
            )}
            <ButtonLink to="/play" variant="ghost">
              Back to Play
            </ButtonLink>
          </div>
        </div>
      </Shell>
    );

  if (state.s === 'intro') {
    const { run, resume } = state;
    return (
      <Intro
        run={run}
        resume={resume}
        onStart={() => {
          writeSaved(storeKey, null);
          start(run, null);
        }}
        onResume={resume ? () => start(resume.run, resume.snap) : undefined}
      />
    );
  }

  const { run, snap } = state;
  const leave = () => {
    finishedRef.current = true;
    writeSaved(storeKey, null);
    navigate(run.back.to);
  };
  return (
    <ExamSession
      questions={run.questions}
      mode={run.runnerMode}
      timeLimitSec={run.timeLimitSec}
      title={run.title}
      subtitle={run.subtitle}
      best={run.previousBest}
      previousBest={run.previousBest}
      submit={run.submit}
      initialState={snap}
      onSnapshot={onSnapshot}
      onExit={leave}
      onSubmitted={() => {
        finishedRef.current = true;
        writeSaved(storeKey, null);
      }}
      resultActions={(r) => <ResultActions run={run} result={r} />}
    />
  );
}

function ResultActions({ run, result }: { run: BuiltRun; result: ExamResultData }) {
  const missed = result.total - result.correct;
  return (
    <>
      {run.again && (
        <ButtonLink to={run.again} variant="accent" leftIcon={<RotateCcw className="size-4" />}>
          {result.kind === 'endless' ? 'New run' : 'Play again'}
        </ButtonLink>
      )}
      {missed > 0 && result.attemptId && (
        <ButtonLink
          to={runHref({ redo: result.attemptId, only: 'wrong' })}
          variant={run.again ? 'outline' : 'accent'}
          leftIcon={<ListRestart className="size-4" />}
        >
          Redo {missed} missed
        </ButtonLink>
      )}
      <ButtonLink to={run.back.to} variant="outline" leftIcon={<ArrowLeft className="size-4" />}>
        {run.back.label}
      </ButtonLink>
      <ButtonLink to="/me/career" variant="ghost" leftIcon={<History className="size-4" />}>
        Career
      </ButtonLink>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="band absolute inset-x-0 top-0 h-64 overflow-hidden" aria-hidden>
        <FacetArt className="opacity-70" />
      </div>
      <div className="relative px-4 pb-12 pt-10 sm:px-6 md:pt-16">{children}</div>
    </div>
  );
}

function Intro({
  run,
  resume,
  onStart,
  onResume,
}: {
  run: BuiltRun;
  resume: Saved | null;
  onStart: () => void;
  onResume?: () => void;
}) {
  const answered = resume?.snap ? resume.snap.chosen.filter((c) => c != null).length : 0;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        (onResume && answered ? onResume : onStart)();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onStart, onResume, answered]);

  const exam = run.runnerMode === 'exam';
  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <ButtonLink
          to={run.back.to}
          variant="ghost"
          size="sm"
          className="mb-4 text-white/80 hover:bg-white/10 hover:text-white"
          leftIcon={<ArrowLeft className="size-4" />}
        >
          {run.back.label}
        </ButtonLink>
        <div className="animate-rise overflow-hidden rounded-[4px] border border-line bg-surface">
          <div className="border-b border-line p-6 md:p-8">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
              <span className="h-[3px] w-5 rounded-none bg-red" aria-hidden />
              {run.subtitle}
            </div>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight md:text-4xl">{run.title}</h1>
            <p className="mt-3 text-[0.975rem] leading-relaxed text-muted">{run.blurb}</p>
            <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
              {run.facts.map((f) => (
                <div key={f.label} className="rounded-[4px] bg-surface-2 px-3 py-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">{f.label}</dt>
                  <dd className="mt-1 line-clamp-2 font-display text-[0.95rem] font-bold leading-tight text-heading">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-surface-2/50 p-6 md:p-8">
            {resume && answered > 0 && onResume && (
              <div className="mb-4 flex items-center gap-3 rounded-[2px] border border-blue/30 border-l-[3px] border-l-blue bg-surface p-3 text-sm">
                <span className="flex-1">
                  You have a run in progress with <b>{answered}</b> answered. Pick up where you left off?
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {resume && answered > 0 && onResume ? (
                <>
                  <Button size="lg" variant="accent" className="sm:flex-1" onClick={onResume} rightIcon={<ArrowRight className="size-4" />}>
                    Resume run
                  </Button>
                  <Button size="lg" variant="outline" onClick={onStart} leftIcon={<RotateCcw className="size-4" />}>
                    Start over
                  </Button>
                </>
              ) : (
                <Button size="lg" variant="accent" block onClick={onStart} leftIcon={<Play className="size-4 fill-current" />}>
                  {exam && run.timeLimitSec ? 'Start the clock' : 'Start'}
                </Button>
              )}
            </div>
            <div className={cn('mt-5 hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted sm:flex')}>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Keyboard className="size-3.5" /> Shortcuts
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>1</Kbd>-<Kbd>4</Kbd> or <Kbd>A</Kbd>-<Kbd>D</Kbd> answer
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Enter</Kbd> {exam ? 'next' : 'continue'}
              </span>
              {exam && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>F</Kbd> flag
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>&larr;</Kbd>
                    <Kbd>&rarr;</Kbd> move
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function IntroSkeleton() {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl" role="status" aria-label="Building your question set">
        <Skeleton className="mb-4 h-8 w-28 opacity-40" />
        <div className="rounded-[4px] border border-line bg-surface p-6 md:p-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-9 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Skeleton className="h-16" rounded="rounded-[4px]" />
            <Skeleton className="h-16" rounded="rounded-[4px]" />
            <Skeleton className="h-16" rounded="rounded-[4px]" />
          </div>
          <Skeleton className="mt-8 h-12 w-full" rounded="rounded-[4px]" />
        </div>
      </div>
    </Shell>
  );
}
