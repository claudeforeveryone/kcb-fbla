import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronDown, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Spinner,
  cn,
  formatUntil,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { ExamRunner, ExamStyles, LETTERS, type ExamQuestion, type RunnerAnswer, type RunnerSnapshot } from '../../components/exam';
import { invalidatePlayHistory } from '../../api/play';
import { useAuth, useProfile } from '../../lib/auth';
import { DIFFICULTY_LABELS, type ProfileCard } from '../../lib/types';
import {
  DUEL_QUESTIONS,
  cancelDuel,
  duelOutcome,
  duelSide,
  fmtMs,
  getDuel,
  getDuelQuestions,
  getDuelRuns,
  getPlayerCards,
  respondDuel,
  startDuel,
  submitDuel,
  subscribeDuel,
  type ArenaEvent,
  type DuelClock,
  type DuelQuestion,
  type DuelRow,
  type DuelRun,
  type DuelRunAnswer,
} from '../../api/arena';
import { ChallengeModal } from './ChallengeModal';
import { VersusBanner, arenaEventName, clockLabel, displayName } from './parts';

// ------------------------------------------------------------------------------------------------ storage

const snapKey = (duelId: string, uid: string) => `kcbfbla:duel:${duelId}:${uid}`;
function readSnap(key: string): RunnerSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RunnerSnapshot) : null;
  } catch {
    return null;
  }
}
function writeSnap(key: string, s: RunnerSnapshot | null) {
  try {
    if (s) localStorage.setItem(key, JSON.stringify(s));
    else localStorage.removeItem(key);
  } catch {
    /* private mode: resume just starts from the first question */
  }
}

// ------------------------------------------------------------------------------------------------ page

type Mode = 'view' | 'play';

export function DuelPage() {
  const { duelId = '' } = useParams();
  const me = useProfile();
  const uid = me.id;
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [duel, setDuel] = useState<DuelRow | null | undefined>(undefined);
  const [players, setPlayers] = useState<Record<string, ProfileCard>>({});
  const [runs, setRuns] = useState<DuelRun[]>([]);
  const [keyed, setKeyed] = useState<DuelQuestion[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [justFinished, setJustFinished] = useState(false);
  const [rematch, setRematch] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await getDuel(duelId);
      setDuel(d);
      if (!d) return;
      const [cards, r] = await Promise.all([getPlayerCards([d.challenger_id, d.opponent_id]), getDuelRuns(d.id)]);
      setPlayers(Object.fromEntries(cards.map((c) => [c.id, c])));
      setRuns(r);
      const mine = r.find((x) => x.user_id === uid);
      if (mine?.finished_at) setKeyed(await getDuelQuestions(d.question_ids, true));
      // a run already started (and not finished) goes straight back to the questions
      if (d.status === 'accepted' && mine && !mine.finished_at) setMode('play');
    } catch (e) {
      setError(e);
    }
  }, [duelId, uid]);

  useEffect(() => {
    setDuel(undefined);
    setKeyed(null);
    setMode('view');
    setJustFinished(false);
    void load();
  }, [load]);

  // live status (accepted, opponent finished, result)
  const duelRef = useRef(duel);
  duelRef.current = duel;
  useEffect(() => {
    if (!duelId) return;
    return subscribeDuel(duelId, (row) => {
      const before = duelRef.current;
      setDuel((d) => (d ? { ...d, ...row } : d));
      if (before && before.status !== 'complete' && row.status === 'complete') {
        void getDuelRuns(row.id).then(setRuns).catch(() => {});
        void refreshProfile();
        setJustFinished(true);
      }
    });
  }, [duelId, refreshProfile]);

  if (error)
    return (
      <Page width="narrow">
        <ErrorState error={error} onRetry={() => void load()} />
      </Page>
    );
  if (duel === undefined) return <DuelSkeleton />;
  if (duel === null)
    return (
      <Page width="narrow">
        <EmptyState
          title="Duel not found"
          description="This duel doesn't exist, or it's between two other players."
          action={<ButtonLink to="/arena">Back to the Arena</ButtonLink>}
        />
      </Page>
    );

  const side = duelSide(duel, uid);
  const meCard = players[uid];
  const opp = players[side.opponentId];
  const myRun = runs.find((r) => r.user_id === uid) ?? null;
  const theirRun = runs.find((r) => r.user_id === side.opponentId) ?? null;

  if (mode === 'play' && duel.status === 'accepted' && !myRun?.finished_at) {
    return (
      <DuelPlay
        duel={duel}
        uid={uid}
        opponent={opp}
        onExit={() => navigate('/arena')}
        onDone={async (finishedRun) => {
          invalidatePlayHistory();
          setRuns((rs) => [...rs.filter((r) => r.user_id !== uid), finishedRun]);
          setMode('view');
          setJustFinished(true);
          window.scrollTo({ top: 0 });
          await load();
          void refreshProfile();
        }}
      />
    );
  }

  const outcome = duelOutcome(duel, uid);
  const eyebrow = `${arenaEventName(duel.event)} · ${clockLabel(duel.time_limit_sec)}`;
  const back = { to: '/arena', label: 'Arena' };

  // ------------------------------------------------------------------------------ complete: results
  if (duel.status === 'complete') {
    const title =
      outcome === 'win'
        ? duel.forfeit_by
          ? 'You win by forfeit'
          : 'Victory'
        : outcome === 'loss'
          ? duel.forfeit_by
            ? 'Forfeit loss'
            : `${displayName(opp)} wins`
          : 'Dead even';
    return (
      <>
        <ExamStyles />
        <PageHeader eyebrow={eyebrow} title={title} back={back} size="md">
          <div className="relative">
            {justFinished && outcome === 'win' && <Confetti />}
            <VersusBanner
              left={meCard}
              right={opp}
              leftScore={side.myScore}
              rightScore={side.theirScore}
              leftMs={side.myScore != null ? fmtMs(side.myMs) : 'did not play'}
              rightMs={side.theirScore != null ? fmtMs(side.theirMs) : 'did not play'}
              winnerId={duel.winner_id}
              center={
                <span className="mt-1 text-center text-[11px] font-bold uppercase tracking-widest text-white/60">
                  {outcome === 'draw' ? 'Draw' : 'Final'}
                </span>
              }
            />
          </div>
        </PageHeader>
        <Page>
          <ResultExplainer duel={duel} uid={uid} opp={opp} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="accent" leftIcon={<RotateCcw className="size-4" />} onClick={() => setRematch(true)} disabled={!opp}>
              Rematch
            </Button>
            <ButtonLink to="/arena" variant="outline">
              Back to the Arena
            </ButtonLink>
            {myRun?.attempt_id && (
              <ButtonLink to={`/play/review/${myRun.attempt_id}`} variant="ghost">
                Review in Career
              </ButtonLink>
            )}
          </div>
          <Comparison
            questions={keyed}
            mine={myRun?.answers ?? null}
            theirs={theirRun?.answers ?? null}
            oppName={displayName(opp)}
          />
        </Page>
        <ChallengeModal
          open={rematch}
          onClose={() => setRematch(false)}
          uid={uid}
          opponent={opp ?? null}
          event={duel.event as ArenaEvent}
          clock={duel.time_limit_sec as DuelClock}
          friends={[]}
          recent={[]}
          onSent={() => navigate('/arena')}
        />
      </>
    );
  }

  // ------------------------------------------------------------------------------ everything before results
  const iPlayed = !!myRun?.finished_at;
  let title: ReactNode = 'Duel';
  let body: ReactNode = null;

  if (duel.status === 'pending' && duel.opponent_id === uid) {
    title = `${displayName(opp)} challenged you`;
    body = <IncomingPanel duel={duel} onChange={(d) => setDuel((x) => (x ? { ...x, ...d } : x))} onAccepted={() => void load()} />;
  } else if (duel.status === 'pending') {
    title = 'Challenge sent';
    body = (
      <Card className="text-center">
        <h2 className="text-lg font-bold">Waiting for {displayName(opp)}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          They have {formatUntil(duel.expires_at)} to accept. You'll get a notification the moment they do, and the
          questions unlock for both of you.
        </p>
        <CancelButton duel={duel} onCancelled={(d) => setDuel((x) => (x ? { ...x, ...d } : x))} />
      </Card>
    );
  } else if (duel.status === 'accepted' && !iPlayed) {
    title = side.theyPlayed ? 'Your move' : 'Ready to duel';
    body = <ReadyPanel duel={duel} theyPlayed={side.theyPlayed} onStart={() => setMode('play')} />;
  } else if (duel.status === 'accepted' && iPlayed) {
    title = 'Locked in';
    body = (
      <>
        <Card className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex size-2 rounded-full bg-blue" aria-hidden />
          <h2 className="text-lg font-bold">Waiting for {displayName(opp)} to play</h2>
          <p className="max-w-md text-sm text-muted">
            You scored <b className="tabular text-heading">{side.myScore}/{DUEL_QUESTIONS}</b> in{' '}
            <b className="tabular text-heading">{fmtMs(side.myMs)}</b>. This page updates live when they finish. They have{' '}
            {formatUntil(duel.expires_at)} before it counts as a forfeit.
          </p>
        </Card>
        <Comparison questions={keyed} mine={myRun?.answers ?? null} theirs={null} oppName={displayName(opp)} />
      </>
    );
  } else {
    const what =
      duel.status === 'declined'
        ? `${duel.opponent_id === uid ? 'You' : displayName(opp)} declined this challenge.`
        : duel.status === 'cancelled'
          ? 'This challenge was cancelled.'
          : 'This duel expired before it was played.';
    title = duel.status === 'expired' ? 'Expired' : duel.status === 'declined' ? 'Declined' : 'Cancelled';
    body = (
      <EmptyState
        title={what}
        description="Rematches are one tap away."
        action={
          <>
            <Button variant="accent" leftIcon={<RotateCcw className="size-4" />} onClick={() => setRematch(true)} disabled={!opp}>
              Challenge again
            </Button>
            <ButtonLink to="/arena" variant="outline">
              Back to the Arena
            </ButtonLink>
          </>
        }
      />
    );
  }

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} back={back}>
        <VersusBanner
          left={meCard}
          right={opp}
          leftScore={duel.status === 'accepted' ? side.myScore : undefined}
          rightScore={duel.status === 'accepted' ? null : undefined}
          leftMs={duel.status === 'accepted' ? (iPlayed ? fmtMs(side.myMs) : 'not played') : undefined}
          rightMs={duel.status === 'accepted' ? (side.theyPlayed ? 'finished, score hidden' : 'not played') : undefined}
        />
        {duel.message && (
          <p className="mx-auto mt-6 max-w-md rounded-[2px] border border-white/15 bg-navy-2 px-4 py-2.5 text-center text-sm italic text-white/85">
            "{duel.message}"
            <span className="ml-1 not-italic text-white/55">- {displayName(players[duel.challenger_id])}</span>
          </p>
        )}
      </PageHeader>
      <Page width="narrow">{body}</Page>
      <ChallengeModal
        open={rematch}
        onClose={() => setRematch(false)}
        uid={uid}
        opponent={opp ?? null}
        event={duel.event as ArenaEvent}
        clock={duel.time_limit_sec as DuelClock}
        friends={[]}
        recent={[]}
        onSent={() => {
          toast.success('Rematch sent');
          navigate('/arena');
        }}
      />
    </>
  );
}

export default DuelPage;

// ------------------------------------------------------------------------------------------------ panels

function IncomingPanel({
  duel,
  onChange,
  onAccepted,
}: {
  duel: DuelRow;
  onChange: (d: DuelRow) => void;
  onAccepted: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | 'y' | 'n'>(null);
  const go = async (accept: boolean) => {
    setBusy(accept ? 'y' : 'n');
    try {
      const d = await respondDuel(duel.id, accept);
      onChange(d);
      if (accept) onAccepted();
      else {
        toast.info('Challenge declined');
        navigate('/arena');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not answer the challenge.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="text-center">
      <h2 className="text-lg font-bold">Up for it?</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        {DUEL_QUESTIONS} questions in {arenaEventName(duel.event)}, {clockLabel(duel.time_limit_sec)} on the clock. Accepting
        doesn't start your timer: you can play any time in the next 48 hours. This challenge expires in{' '}
        {formatUntil(duel.expires_at)}.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="ghost" onClick={() => go(false)} loading={busy === 'n'} disabled={!!busy} leftIcon={<X className="size-4" />}>
          Decline
        </Button>
        <Button variant="accent" size="lg" onClick={() => go(true)} loading={busy === 'y'} disabled={!!busy} leftIcon={<Check className="size-5" />}>
          Accept challenge
        </Button>
      </div>
    </Card>
  );
}

function CancelButton({ duel, onCancelled }: { duel: DuelRow; onCancelled: (d: DuelRow) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="mt-5"
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onCancelled(await cancelDuel(duel.id));
          toast.info('Challenge cancelled');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not cancel.');
        } finally {
          setBusy(false);
        }
      }}
    >
      Cancel challenge
    </Button>
  );
}

function ReadyPanel({ duel, theyPlayed, onStart }: { duel: DuelRow; theyPlayed: boolean; onStart: () => void }) {
  const per = Math.round(duel.time_limit_sec / DUEL_QUESTIONS);
  const rules: { text: ReactNode }[] = [
    { text: <>{DUEL_QUESTIONS} questions from {arenaEventName(duel.event)}, the same set your opponent gets.</> },
    {
      text: (
        <>
          <b>{clockLabel(duel.time_limit_sec)}</b> on the clock (about {per}s a question). It starts when you press Start and
          keeps running if you leave.
        </>
      ),
    },
    { text: <>Most correct wins. If you tie, the faster total time wins.</> },
    { text: <>No answers are shown until you've both played, so no peeking.</> },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      {theyPlayed && (
        <div className="border-b border-l-4 border-line border-l-blue bg-surface-2 px-5 py-3 text-sm font-semibold text-blue dark:text-link">
          Your opponent has already played. Their score stays hidden until you finish.
        </div>
      )}
      <ul className="space-y-4 p-5 sm:p-6">
        {rules.map((r, i) => (
          <li key={i} className="flex items-start gap-3 text-[0.9375rem]">
            <span className="tabular w-7 shrink-0 pt-px font-display text-sm font-black text-red">{String(i + 1).padStart(2, '0')}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-2 border-t border-line bg-surface-2 px-5 py-5">
        <Button variant="accent" size="lg" onClick={onStart} className="min-w-56">
          Start the duel
        </Button>
        <span className="text-xs text-muted">Play by {new Date(duel.expires_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ play

function DuelPlay({
  duel,
  uid,
  opponent,
  onExit,
  onDone,
}: {
  duel: DuelRow;
  uid: string;
  opponent?: ProfileCard;
  onExit: () => void;
  onDone: (run: DuelRun) => void | Promise<void>;
}) {
  const toast = useToast();
  const key = snapKey(duel.id, uid);
  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [initial, setInitial] = useState<RunnerSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [snap, setSnap] = useState<RunnerSnapshot | null>(null);
  const pending = useRef<RunnerAnswer[] | null>(null);

  const prepare = useCallback(async () => {
    setError(null);
    try {
      const [qs, start] = await Promise.all([getDuelQuestions(duel.question_ids), startDuel(duel.id)]);
      if (start.finished) {
        await onDone({
          duel_id: duel.id,
          user_id: uid,
          started_at: start.started_at,
          finished_at: start.server_now,
          score: null,
          ms: null,
          answers: [],
          attempt_id: null,
        });
        return;
      }
      // anchor the deadline to the server clock, corrected for this device's clock skew
      const skew = new Date(start.server_now).getTime() - Date.now();
      const deadline = new Date(start.deadline).getTime() - skew;
      const startedAt = new Date(start.started_at).getTime() - skew;
      const saved = readSnap(key);
      const n = qs.length;
      const base: RunnerSnapshot =
        saved && Array.isArray(saved.chosen) && saved.chosen.length === n
          ? { ...saved, deadline, startedAt }
          : {
              index: 0,
              chosen: Array(n).fill(null),
              revealed: Array(n).fill(false),
              flags: Array(n).fill(false),
              ms: Array(n).fill(0),
              startedAt,
              deadline,
              reached: 1,
            };
      setInitial(base);
      setQuestions(
        qs.map((q) => ({ id: q.id, q: q.q, choices: q.choices, sub: q.sub, diff: q.diff, event: q.event })),
      );
    } catch (e) {
      setError(e);
    }
  }, [duel.id, duel.question_ids, key, uid, onDone]);

  const prepared = useRef<string | null>(null);
  useEffect(() => {
    if (prepared.current === duel.id) return; // StrictMode double effect: start once
    prepared.current = duel.id;
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.id]);

  const send = useCallback(async () => {
    const answers = pending.current;
    if (!answers) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitDuel(
        duel.id,
        answers.map(({ question_id, chosen, ms }) => ({ question_id, chosen, ms: Math.round(ms) })),
      );
      writeSnap(key, null);
      await onDone({
        duel_id: duel.id,
        user_id: uid,
        started_at: '',
        finished_at: new Date().toISOString(),
        score: res.score,
        ms: res.ms,
        answers: res.answers,
        attempt_id: res.attempt_id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not submit your answers.';
      if (/already played/i.test(msg)) {
        writeSnap(key, null);
        await onDone({ duel_id: duel.id, user_id: uid, started_at: '', finished_at: '', score: null, ms: null, answers: [], attempt_id: null });
        return;
      }
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [duel.id, key, onDone, uid]);

  const onSnapshot = useCallback(
    (s: RunnerSnapshot) => {
      writeSnap(key, s);
      setSnap(s);
    },
    [key],
  );

  if (error)
    return (
      <Page width="narrow">
        <ErrorState error={error} onRetry={() => void prepare()} />
      </Page>
    );
  if (!questions || !initial)
    return (
      <Page width="narrow" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="size-6" />
        <span className="text-sm">Loading your questions...</span>
      </Page>
    );

  if (submitError)
    return (
      <Page width="narrow">
        <Card className="border-l-4 border-l-red text-center">
          <h2 className="text-lg font-bold">Your answers are safe, but we couldn't send them</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{submitError}</p>
          <Button className="mt-5" onClick={() => void send()} loading={submitting} leftIcon={<RefreshCw className="size-4" />}>
            Try again
          </Button>
        </Card>
      </Page>
    );

  return (
    <div className="pb-10">
      <ExamRunner
        questions={questions}
        mode="exam"
        timeLimitSec={duel.time_limit_sec}
        initialState={initial}
        onSnapshot={onSnapshot}
        submitting={submitting}
        title={
          <span>vs {displayName(opponent)}</span>
        }
        subtitle={`${arenaEventName(duel.event)} · ${DUEL_QUESTIONS} questions`}
        onExit={() => {
          toast.info('Your clock is still running', 'Come back before it runs out; your answers are saved on this device.');
          onExit();
        }}
        onFinish={(answers, meta) => {
          pending.current = answers;
          if (meta.reason === 'timeout') toast.info("Time's up", 'Your answers were submitted automatically.');
          void send();
        }}
      />
      {snap && <PaceStrip snap={snap} perSec={duel.time_limit_sec / DUEL_QUESTIONS} total={questions.length} />}
    </div>
  );
}

/** Time on the current question against the duel's per-question pace. */
function PaceStrip({ snap, perSec, total }: { snap: RunnerSnapshot; perSec: number; total: number }) {
  const [now, setNow] = useState(() => Date.now());
  const entered = useRef({ index: -1, at: Date.now() });
  if (snap.index !== entered.current.index) entered.current = { index: snap.index, at: Date.now() };
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const onQ = (snap.ms[snap.index] ?? 0) + Math.max(0, now - entered.current.at);
  const ratio = Math.min(1, onQ / (perSec * 1000));
  const over = onQ > perSec * 1000;
  const answered = snap.chosen.filter((c) => c != null).length;
  const elapsed = Math.max(0, now - snap.startedAt);
  const expected = Math.min(total, Math.floor(elapsed / (perSec * 1000)));
  const ahead = answered - expected;
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 px-4 md:bottom-4">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-[2px] border border-line bg-surface px-4 py-2 shadow-lift">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-heading">
              Q{snap.index + 1} <span className="tabular font-normal text-muted">{fmtMs(onQ, true)}</span>
            </span>
            <span className={cn('tabular font-semibold', ahead >= 0 ? 'text-success' : 'text-warning')}>
              {ahead > 0 ? `${ahead} ahead of pace` : ahead === 0 ? 'on pace' : `${-ahead} behind pace`}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-none bg-surface-3" aria-hidden>
            <div
              className={cn('h-full transition-[width] duration-200 ease-linear', over ? 'bg-warning' : 'bg-blue')}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
        <span className="tabular shrink-0 text-[11px] text-muted" title="Target time per question">
          / {Math.round(perSec)}s
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ results

function ResultExplainer({ duel, uid, opp }: { duel: DuelRow; uid: string; opp?: ProfileCard }) {
  const side = duelSide(duel, uid);
  const o = duelOutcome(duel, uid);
  let text: ReactNode;
  if (duel.forfeit_by) {
    text =
      duel.forfeit_by === uid
        ? `You didn't play within 48 hours, so ${displayName(opp)} takes the win.`
        : `${displayName(opp)} didn't play within 48 hours, so the win is yours.`;
  } else if (side.myScore === side.theirScore) {
    text =
      o === 'draw'
        ? `Same score and the same time, to the second. That's a true draw.`
        : o === 'win'
          ? `Tied on ${side.myScore} correct, and you were faster by ${fmtMs(Math.abs((side.theirMs ?? 0) - (side.myMs ?? 0)), true)}.`
          : `Tied on ${side.myScore} correct, but ${displayName(opp)} was faster by ${fmtMs(Math.abs((side.theirMs ?? 0) - (side.myMs ?? 0)), true)}.`;
  } else {
    const diff = Math.abs((side.myScore ?? 0) - (side.theirScore ?? 0));
    text =
      o === 'win'
        ? `You won by ${diff} question${diff === 1 ? '' : 's'}.`
        : `${displayName(opp)} won by ${diff} question${diff === 1 ? '' : 's'}. Check the breakdown and run it back.`;
  }
  return (
    <div
      className={cn(
        'rounded-[2px] border border-l-4 border-line bg-surface px-4 py-3 text-sm',
        o === 'win' ? 'border-l-success' : o === 'loss' ? 'border-l-red' : 'border-l-blue',
      )}
    >
      {text}
    </div>
  );
}

type CompareFilter = 'all' | 'split' | 'missed';

function Comparison({
  questions,
  mine,
  theirs,
  oppName,
}: {
  questions: DuelQuestion[] | null;
  mine: DuelRunAnswer[] | null;
  theirs: DuelRunAnswer[] | null;
  oppName: string;
}) {
  const [filter, setFilter] = useState<CompareFilter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const byMine = useMemo(() => new Map((mine ?? []).map((a) => [a.question_id, a])), [mine]);
  const byTheirs = useMemo(() => new Map((theirs ?? []).map((a) => [a.question_id, a])), [theirs]);
  const showTheirs = theirs != null && theirs.length > 0;

  const stats = useMemo(() => {
    const calc = (xs: DuelRunAnswer[] | null) => {
      if (!xs || xs.length === 0) return null;
      const right = xs.filter((a) => a.correct);
      const answered = xs.filter((a) => a.chosen != null);
      return {
        correct: right.length,
        avg: answered.length ? answered.reduce((s, a) => s + a.ms, 0) / answered.length : 0,
        fastest: right.length ? Math.min(...right.map((a) => a.ms)) : null,
      };
    };
    return { me: calc(mine), them: calc(theirs) };
  }, [mine, theirs]);

  if (!questions)
    return (
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" rounded="rounded-[2px]" />
        ))}
      </div>
    );
  if (!mine || mine.length === 0) return null;

  const rows = questions
    .map((q, i) => ({ q, i, a: byMine.get(q.id), b: byTheirs.get(q.id) }))
    .filter(({ a, b }) =>
      filter === 'all' ? true : filter === 'missed' ? !a?.correct : !!a && !!b && a.correct !== b.correct,
    );

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Question by question</h2>
          <p className="text-sm text-muted">
            {showTheirs ? `Your answers and ${oppName}'s, side by side.` : `Your answers. ${oppName}'s appear here once they've played.`}
          </p>
        </div>
        <SegmentedControl<CompareFilter>
          size="sm"
          aria-label="Filter questions"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            ...(showTheirs ? [{ value: 'split' as const, label: 'Split' }] : []),
            { value: 'missed', label: 'I missed' },
          ]}
        />
      </div>

      {(stats.me || stats.them) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Correct" me={stats.me ? `${stats.me.correct}/${mine.length}` : '-'} them={showTheirs && stats.them ? `${stats.them.correct}/${theirs!.length}` : null} />
          <MiniStat label="Avg per answer" me={stats.me ? fmtMs(stats.me.avg, true) : '-'} them={showTheirs && stats.them ? fmtMs(stats.them.avg, true) : null} />
          <MiniStat
            label="Fastest correct"
            me={stats.me?.fastest != null ? fmtMs(stats.me.fastest, true) : '-'}
            them={showTheirs ? (stats.them?.fastest != null ? fmtMs(stats.them.fastest, true) : '-') : null}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState compact title="Nothing to show" description="No questions match this filter." />
      ) : (
        <ol className="space-y-3">
          {rows.map(({ q, i, a, b }) => {
            const expanded = open.has(q.id);
            const faster =
              a?.correct && b?.correct ? (a.ms < b.ms ? 'me' : b.ms < a.ms ? 'them' : null) : null;
            return (
              <li key={q.id}>
                <Card padded={false} className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(q.id)) n.delete(q.id);
                        else n.add(q.id);
                        return n;
                      })
                    }
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="tabular grid size-7 shrink-0 place-items-center rounded-[2px] bg-surface-2 font-display text-xs font-bold text-muted ring-1 ring-inset ring-line">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[0.9375rem] font-semibold text-heading', !expanded && 'line-clamp-2')}>{q.q}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {q.sub && <span className="truncate">{q.sub}</span>}
                        {q.diff && <span>· {DIFFICULTY_LABELS[q.diff]}</span>}
                      </span>
                    </span>
                    <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
                  </button>
                  <div className={cn('grid border-t border-line', showTheirs ? 'grid-cols-2 divide-x divide-line' : 'grid-cols-1')}>
                    <AnswerCell label="You" a={a} faster={faster === 'me'} />
                    {showTheirs && <AnswerCell label={oppName} a={b} faster={faster === 'them'} />}
                  </div>
                  {expanded && (
                    <div className="space-y-2 border-t border-line bg-surface-2 px-4 py-4">
                      <ul className="space-y-1.5">
                        {q.choices.map((c, ci) => {
                          const right = ci === q.answer;
                          const myPick = a?.chosen === ci;
                          const theirPick = b?.chosen === ci;
                          return (
                            <li
                              key={ci}
                              className={cn(
                                'flex items-start gap-2.5 rounded-[2px] border px-3 py-2 text-sm',
                                right ? 'border-success/40 bg-success/[0.07]' : myPick || theirPick ? 'border-red/25 bg-red/[0.04]' : 'border-line bg-surface',
                              )}
                            >
                              <span
                                className={cn(
                                  'grid size-6 shrink-0 place-items-center rounded-[2px] font-display text-xs font-bold',
                                  right ? 'bg-success text-white' : 'bg-surface-2 text-muted ring-1 ring-inset ring-line',
                                )}
                              >
                                {LETTERS[ci]}
                              </span>
                              <span className="min-w-0 flex-1 pt-0.5">{c}</span>
                              <span className="flex shrink-0 gap-1">
                                {myPick && <Badge tone={right ? 'success' : 'red'}>You</Badge>}
                                {theirPick && <Badge tone={right ? 'success' : 'neutral'}>Them</Badge>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      {q.explain && (
                        <p className="pt-1 text-sm text-muted">
                          <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wider text-heading">Why</span>
                          {q.explain}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AnswerCell({ label, a, faster }: { label: string; a?: DuelRunAnswer; faster: boolean }) {
  const skipped = !a || a.chosen == null;
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 py-2.5">
      {skipped ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-[2px] bg-surface-3 text-muted">
          <X className="size-3" aria-hidden />
        </span>
      ) : a.correct ? (
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Correct" />
      ) : (
        <XCircle className="size-5 shrink-0 text-red dark:text-danger" aria-label="Wrong" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="font-semibold text-heading">{label}</span>
        <span className="text-muted">
          {' '}
          {skipped ? 'no answer' : `chose ${LETTERS[a.chosen!]}`}
        </span>
      </span>
      {a && a.ms > 0 && (
        <span
          className={cn(
            'tabular inline-flex shrink-0 items-center rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold',
            faster ? 'bg-blue text-white' : 'text-muted',
          )}
          title={faster ? 'Faster correct answer' : 'Time on this question'}
        >

          {fmtMs(a.ms, true)}
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, me, them }: { label: string; me: string; them: string | null }) {
  return (
    <div className="rounded-[2px] border border-line bg-surface px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="tabular font-display text-xl font-extrabold text-heading">{me}</span>
        {them != null && (
          <span className="tabular text-sm font-semibold text-muted">
            vs <span className="text-ink">{them}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ bits

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: 50 + (Math.random() - 0.5) * 30,
        dx: `${(Math.random() - 0.5) * 520}px`,
        dy: `${-80 - Math.random() * 220}px`,
        rot: `${Math.random() * 720 - 360}deg`,
        delay: Math.random() * 250,
        color: ['#BF0D3E', '#3F6FB3', '#FFFFFF'][i % 3],

        w: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-1/2 block rounded-[2px]"
          style={
            {
              left: `${b.left}%`,
              width: b.w,
              height: b.w * 0.45,
              background: b.color,
              '--dx': b.dx,
              '--dy': b.dy,
              '--rot': b.rot,
              animation: `exam-confetti 1500ms cubic-bezier(.2,.7,.3,1) ${b.delay}ms both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function DuelSkeleton() {
  return (
    <>
      <div className="facets h-72 w-full" aria-hidden />
      <Page width="narrow">
        <div className="space-y-3" role="status" aria-label="Loading duel">
          <Skeleton className="h-28 w-full" rounded="rounded-[2px]" />
          <Skeleton className="h-20 w-full" rounded="rounded-[2px]" />
        </div>
      </Page>
    </>
  );
}

