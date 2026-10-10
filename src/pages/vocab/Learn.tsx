import { useMemo, useState } from 'react';
import { ArrowRight, Brain, CalendarCheck, Check, Eye, Sparkles, Target, X } from 'lucide-react';
import { Button, ButtonLink, Kbd, cn } from '../../components/ui';
import type { StudyDeck, VocabTerm } from '../../api/vocab';
import {
  BOX_DAYS,
  MASTERED_BOX,
  deckStats,
  distractors,
  learnQueue,
  relativeDue,
  shuffled,
  statusOf,
  weakestQueue,
  type ProgressLike,
} from './leitner';
import { recordReview } from './store';
import { MiniStat, SessionPanel, StatusChip, useHotkeys } from './parts';

type Item = { term: VocabTerm; attempt: number };
type Outcome = { promoted: number; missed: Set<string>; mastered: number; answered: number };

/**
 * Spaced-repetition session. Young terms (new or box 0-1) are asked as multiple choice; older ones as recall with
 * self-grading. A miss puts the term back a few cards later until it is answered right.
 */
export function Learn({ deck, progress }: { deck: StudyDeck; progress: ReadonlyMap<string, ProgressLike> }) {
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<'srs' | 'drill' | null>(null);
  const stats = deckStats(
    deck.terms.map((t) => t.id),
    progress,
  );

  // Session content is fixed at the start of each run.
  const queue = useMemo(() => {
    if (mode === 'drill') return weakestQueue(deck.terms, progress, 10);
    return learnQueue(deck.terms, progress, { newLimit: 10, max: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mode, deck.terms]);

  if (!mode) {
    const plan = learnQueue(deck.terms, progress, { newLimit: 10, max: 20 });
    const dueN = plan.filter((t) => progress.has(t.id)).length;
    const newN = plan.length - dueN;
    if (!plan.length) {
      return (
        <SessionPanel
          icon={<CalendarCheck />}
          tone="success"
          eyebrow="All caught up"
          title="Nothing due right now"
          actions={
            <>
              {stats.total - stats.fresh > 0 && (
                <Button leftIcon={<Target className="size-4" />} onClick={() => setMode('drill')}>
                  Drill my weakest {Math.min(10, stats.total - stats.fresh)}
                </Button>
              )}
              <ButtonLink to="/vocab" variant="outline">
                Pick another deck
              </ButtonLink>
            </>
          }
        >
          {stats.nextDue ? (
            <p>
              Your next review here is <strong className="text-heading">{relativeDue(stats.nextDue)}</strong>. Coming back
              right on time is what makes it stick.
            </p>
          ) : (
            <p>Every term in this deck is studied. Drill the weakest ones, or try Match and Quiz.</p>
          )}
        </SessionPanel>
      );
    }
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="absolute inset-y-0 left-0 w-1 bg-red" aria-hidden />
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy/8 text-navy dark:bg-blue/20 dark:text-link">
              <Brain className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold">Today's session</h2>
              <p className="mt-1 text-[0.9375rem] text-muted">
                {dueN > 0 && newN > 0
                  ? `${dueN} ${dueN === 1 ? 'review' : 'reviews'} that are due, then ${newN} new ${newN === 1 ? 'term' : 'terms'}.`
                  : dueN > 0
                    ? `${dueN} ${dueN === 1 ? 'review' : 'reviews'} due. Clear them before they pile up.`
                    : `${newN} new ${newN === 1 ? 'term' : 'terms'} to learn.`}
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <MiniStat label="Due" value={dueN} tone={dueN ? 'red' : undefined} />
            <MiniStat label="New" value={newN} tone="blue" />
            <MiniStat label="Mastered" value={stats.mastered} tone="success" />
          </div>
          <Button size="lg" block className="mt-6" rightIcon={<ArrowRight className="size-5" />} onClick={() => setMode('srs')}>
            Start learning
          </Button>
        </div>
        <HowItWorks />
      </div>
    );
  }

  return (
    <Session
      key={`${run}-${mode}`}
      queue={queue}
      pool={deck.terms}
      progress={progress}
      drill={mode === 'drill'}
      onAgain={() => {
        setRun((r) => r + 1);
      }}
      onExit={() => {
        setMode(null);
        setRun((r) => r + 1);
      }}
    />
  );
}

function HowItWorks() {
  const steps = BOX_DAYS.slice(1).map((d, i) => ({ box: i + 1, d }));
  return (
    <div className="rounded-[12px] border border-line bg-surface-2/60 p-4 text-sm text-muted">
      <div className="mb-3 flex items-center gap-2 font-display font-semibold text-heading">
        <Sparkles className="size-4 text-red" /> How the schedule works
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={s.box} className="flex items-center gap-1.5">
            <span
              className={cn(
                'tabular rounded-md px-2 py-1 text-xs font-semibold',
                s.box >= MASTERED_BOX ? 'bg-success/12 text-success' : 'bg-surface text-ink ring-1 ring-line',
              )}
            >
              {s.d === 1 ? '1 day' : `${s.d} days`}
            </span>
            {i < steps.length - 1 && <ArrowRight className="size-3 text-muted/60" aria-hidden />}
          </span>
        ))}
      </div>
      <p className="mt-3">
        Each right answer on a due term pushes it further out. A miss sends it back to the start. Terms that reach the
        8-day step count as mastered.
      </p>
    </div>
  );
}

function Session({
  queue: initial,
  pool,
  progress,
  drill,
  onAgain,
  onExit,
}: {
  queue: VocabTerm[];
  pool: VocabTerm[];
  progress: ReadonlyMap<string, ProgressLike>;
  drill: boolean;
  onAgain: () => void;
  onExit: () => void;
}) {
  const [items, setItems] = useState<Item[]>(() => initial.map((term) => ({ term, attempt: 0 })));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [out, setOut] = useState<Outcome>({ promoted: 0, missed: new Set(), mastered: 0, answered: 0 });
  const total = initial.length;
  const item = items[pos];
  const cleared = total - new Set(items.slice(pos).map((x) => x.term.id)).size;

  // Fixed per card: is this a multiple-choice card, and its options.
  const card = useMemo(() => {
    if (!item) return null;
    const p = progress.get(item.term.id);
    const young = !p || p.box <= 1;
    const mc = young && pool.length >= 4;
    const options = mc ? shuffled([item.term, ...distractors(item.term, pool, 3)]) : [];
    return { mc, options, status: statusOf(p) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const answer = (correct: boolean) => {
    if (!item) return;
    const r = recordReview(item.term.id, correct);
    setOut((o) => {
      const missed = new Set(o.missed);
      if (!correct) missed.add(item.term.id);
      return {
        promoted: o.promoted + (r.promoted ? 1 : 0),
        missed,
        mastered: o.mastered + (r.promoted && r.box === MASTERED_BOX ? 1 : 0),
        answered: o.answered + 1,
      };
    });
    if (!correct) {
      setItems((list) => {
        const copy = [...list];
        copy.splice(Math.min(copy.length, pos + 4), 0, { term: item.term, attempt: item.attempt + 1 });
        return copy;
      });
    }
  };

  const next = () => {
    setPos((p) => p + 1);
    setRevealed(false);
    setPicked(null);
  };

  const choose = (idx: number) => {
    if (!card || picked !== null) return;
    setPicked(idx);
    answer(card.options[idx].id === item.term.id);
  };

  useHotkeys((e) => {
    if (!item || !card) return;
    if (card.mc) {
      if (picked === null && /^[1-4]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        if (n < card.options.length) choose(n);
      } else if (picked !== null && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
        e.preventDefault();
        next();
      }
    } else if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      setRevealed(true);
    } else if (revealed && (e.key === '1' || e.key === 'ArrowLeft')) {
      answer(false);
      next();
    } else if (revealed && (e.key === '2' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      answer(true);
      next();
    }
  });

  if (!item || !card) {
    const missed = out.missed.size;
    return (
      <SessionPanel
        icon={<Check />}
        tone="success"
        eyebrow={drill ? 'Drill complete' : 'Session complete'}
        title={missed ? `${total - missed} of ${total} first try` : `All ${total} on the first try`}
        actions={
          <>
            <Button onClick={onAgain} rightIcon={<ArrowRight className="size-4" />}>
              {drill ? 'Drill again' : 'Next session'}
            </Button>
            <Button variant="outline" onClick={onExit}>
              Done
            </Button>
          </>
        }
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <MiniStat label="Moved up" value={out.promoted} tone="success" />
          <MiniStat label="Missed" value={missed} tone="red" />
          <MiniStat label="Newly mastered" value={out.mastered} tone="blue" />
        </div>
        {drill && <p className="mt-4 text-sm">Drills don't move terms up early. They come back when they are due.</p>}
      </SessionPanel>
    );
  }

  const isRight = picked !== null && card.options[picked].id === item.term.id;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="tabular font-display font-bold text-heading">
          {cleared} <span className="font-semibold text-muted">/ {total} cleared</span>
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(cleared / total) * 100}%` }} />
        </div>
        <Button variant="ghost" size="xs" onClick={onExit}>
          End
        </Button>
      </div>

      <div key={pos} className="animate-slide-in rounded-[18px] border border-line bg-surface p-5 shadow-card sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {card.mc ? 'Pick the definition' : 'Do you remember?'}
          </span>
          <span className="flex items-center gap-2">
            {item.attempt > 0 && (
              <span className="text-[11px] font-semibold text-red dark:text-danger">Try again</span>
            )}
            <StatusChip status={card.status} />
          </span>
        </div>
        <h2 className="text-center font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{item.term.term}</h2>
        {item.term.sub && <p className="mt-1 text-center text-xs text-muted">{item.term.sub}</p>}

        {card.mc ? (
          <div className="mt-6 grid gap-2" role="group" aria-label="Choices">
            {card.options.map((o, idx) => {
              const correct = o.id === item.term.id;
              const state = picked === null ? 'idle' : correct ? 'right' : picked === idx ? 'wrong' : 'dim';
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={picked !== null}
                  onClick={() => choose(idx)}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[0.9375rem] leading-snug transition-[border-color,background-color,opacity,transform] duration-150',
                    state === 'idle' && 'border-line-strong bg-surface hover:-translate-y-px hover:border-blue/60 hover:bg-blue/5',
                    state === 'right' && 'border-success bg-success/10 text-ink',
                    state === 'wrong' && 'animate-[vocab-shake_320ms_ease-in-out] border-red bg-red/8 text-ink',
                    state === 'dim' && 'border-line opacity-55',
                  )}
                >
                  <span
                    className={cn(
                      'tabular mt-px grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold',
                      state === 'right' ? 'bg-success text-white' : state === 'wrong' ? 'bg-red text-white' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {state === 'right' ? <Check className="size-3.5" /> : state === 'wrong' ? <X className="size-3.5" /> : idx + 1}
                  </span>
                  <span>{o.def}</span>
                </button>
              );
            })}
          </div>
        ) : revealed ? (
          <div className="animate-fade-in mt-6 rounded-xl bg-surface-2 p-4 text-center text-[1.0625rem] leading-relaxed text-ink">
            {item.term.def}
          </div>
        ) : (
          <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-line-strong px-4 py-8 text-sm text-muted">
            Say the definition in your head, then check.
          </div>
        )}
      </div>

      {card.mc ? (
        picked !== null && (
          <div className="animate-rise flex items-center justify-between gap-3">
            <p className={cn('font-display font-bold', isRight ? 'text-success' : 'text-red dark:text-danger')}>
              {isRight ? 'Correct' : 'Not quite. It will come back in a moment.'}
            </p>
            <Button onClick={next} rightIcon={<ArrowRight className="size-4" />}>
              Continue <Kbd className="ml-1 hidden border-white/30 bg-white/10 text-white/80 md:inline-grid">Enter</Kbd>
            </Button>
          </div>
        )
      ) : revealed ? (
        <div className="animate-rise grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="lg"
            className="text-red hover:border-red/50 dark:text-danger"
            leftIcon={<X className="size-5" />}
            onClick={() => {
              answer(false);
              next();
            }}
          >
            Missed it
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="text-success hover:border-success/50"
            leftIcon={<Check className="size-5" />}
            onClick={() => {
              answer(true);
              next();
            }}
          >
            Got it
          </Button>
        </div>
      ) : (
        <Button size="lg" block leftIcon={<Eye className="size-5" />} onClick={() => setRevealed(true)}>
          Show answer
        </Button>
      )}
      <p className="hidden items-center justify-center gap-3 text-xs text-muted md:flex">
        {card.mc ? (
          <>
            <span className="flex items-center gap-1">
              <Kbd>1</Kbd>-<Kbd>4</Kbd> choose
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd> continue
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <Kbd>Space</Kbd> show
            </span>
            <span className="flex items-center gap-1">
              <Kbd>1</Kbd> missed
            </span>
            <span className="flex items-center gap-1">
              <Kbd>2</Kbd> got it
            </span>
          </>
        )}
      </p>
    </div>
  );
}
