import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Flame,
  Gauge,
  Lightbulb,
  Minus,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { Badge, Card, CardHeader, ProgressBar, SegmentedControl, TierGem, cn, tierFor } from '../ui';
import { FacetArt } from '../ui/PageHeader';
import { Sparkline } from '../charts';
import { ATTEMPT_KIND_LABELS, DIFFICULTY_LABELS, NO_ELO_KINDS, achievementDef, eventName } from '../../lib/types';
import { AchievementIcon } from './AchievementIcon';
import { ExamStyles } from './ExamStyles';
import { areaBreakdown, fmtDuration, verdict, type ExamResultData, type ResultAnswer } from './result';
import { LETTERS, type ExamQuestion } from './types';
import { useCountUp } from './useCountUp';

export type ExamResultsProps = {
  data: ExamResultData;
  /** Question content for the review list (official from static JSON, custom from the test). */
  questions: ExamQuestion[];
  /** Buttons under the hero (Play again, Redo missed, ...). */
  actions?: ReactNode;
  /** Animate the score and Elo (fresh results). Off for stored reviews. */
  animate?: boolean;
  /** Endless: the previous record, to celebrate a new best. */
  previousBest?: number | null;
  /** Small line above the title, e.g. "Viewing Sam's attempt". */
  note?: ReactNode;
};

type Filter = 'all' | 'missed' | 'correct' | 'flagged';

export function ExamResults({ data, questions, actions, animate = true, previousBest, note }: ExamResultsProps) {
  const pct = data.total ? data.correct / data.total : 0;
  const v = verdict(pct, data.total);
  const endless = data.kind === 'endless';
  const newBest = endless && previousBest != null && data.correct > previousBest && data.correct > 0;
  const byQ = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const areas = useMemo(() => areaBreakdown(data), [data]);
  const flagged = data.answers.filter((a) => a.flagged).length;
  const missed = data.answers.filter((a) => !a.correct).length;
  const [filter, setFilter] = useState<Filter>(missed ? 'missed' : 'all');
  const shown = data.answers
    .map((a, i) => ({ a, i }))
    .filter(({ a }) =>
      filter === 'all' ? true : filter === 'missed' ? !a.correct : filter === 'correct' ? a.correct : a.flagged,
    );
  const avgMs = data.answers.length ? data.answers.reduce((s, a) => s + a.ms, 0) / data.answers.length : 0;
  const date = data.createdAt ? new Date(data.createdAt) : null;

  return (
    <div>
      <ExamStyles />
      {/* hero */}
      <section className="facets relative isolate overflow-hidden text-white">
        <FacetArt className="opacity-80 max-md:opacity-40" />
        {animate && pct >= 0.9 && data.total >= 5 && <Confetti />}
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pb-10 pt-8 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)] md:pb-12 md:pt-10 lg:grid-cols-[auto_minmax(0,1fr)_320px]">
          <ScoreRing pct={pct} correct={data.correct} total={data.total} animate={animate} endless={endless} />
          <div className="min-w-0 exam-rise" style={{ animationDelay: '120ms' }}>
            {note && <div className="mb-2 text-sm text-white/75">{note}</div>}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
              <span className="h-[3px] w-5 rounded-full bg-red" aria-hidden />
              {ATTEMPT_KIND_LABELS[data.kind]}
              {data.event && <span className="text-white/50">/</span>}
              {data.event && <span>{eventName(data.event)}</span>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              {endless ? (newBest ? 'New personal best' : `Run over: ${data.correct} in a row`) : v.title}
            </h1>
            <p className="mt-2 max-w-xl text-white/75">
              {endless
                ? newBest
                  ? `${data.correct} correct before running out of lives. Your old record was ${previousBest}.`
                  : previousBest
                    ? `Your best run is ${Math.max(previousBest, data.correct)}. Go again and beat it.`
                    : 'Every right answer extends the run. Three misses and it ends.'
                : data.label && data.label !== v.title
                  ? `${data.label}. ${v.line}`
                  : v.line}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <HeroChip icon={<Clock className="size-3.5" />}>{fmtDuration(data.durationMs)}</HeroChip>
              {data.answers.length > 0 && (
                <HeroChip icon={<Gauge className="size-3.5" />}>{(avgMs / 1000).toFixed(1)}s a question</HeroChip>
              )}
              {data.currentStreak != null && data.currentStreak > 0 && (
                <HeroChip icon={<Flame className="size-3.5" />}>
                  {data.currentStreak}-day streak
                </HeroChip>
              )}
              {flagged > 0 && <HeroChip icon={<Flag className="size-3.5" />}>{flagged} flagged</HeroChip>}
              {date && !animate && (
                <HeroChip>
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </HeroChip>
              )}
            </div>
          </div>
          <EloPanel data={data} animate={animate} />
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8">
        {actions && <div className="mb-6 flex flex-wrap gap-2">{actions}</div>}

        {data.achievements.length > 0 && (
          <section className="mb-6" aria-label="Achievements unlocked">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.achievements.map((code, i) => {
                const def = achievementDef(code);
                return (
                  <div
                    key={code}
                    className="exam-pop relative flex items-center gap-3 overflow-hidden rounded-[12px] border border-warning/40 bg-gradient-to-br from-warning/15 via-surface to-surface p-4 shadow-card"
                    style={{ animationDelay: `${500 + i * 140}ms` }}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#FFE08A] to-[#C98A00] text-white shadow-[0_4px_14px_-4px_rgb(201_138_0/0.6)]">
                      <AchievementIcon code={code} className="size-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#8a5f00] dark:text-warning">
                        Achievement unlocked
                      </div>
                      <div className="font-display font-bold text-heading">{def?.title ?? code}</div>
                      {def && <div className="text-sm text-muted">{def.description}</div>}
                    </div>
                    <Sparkles className="absolute right-3 top-3 size-4 text-warning/70" aria-hidden />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {areas.length > 0 && data.total >= 3 && (
          <Card className="mb-6">
            <CardHeader
              title="By competency area"
              subtitle={areas.length > 1 ? 'Weakest first. These are the areas to drill next.' : undefined}
              icon={<Trophy className="size-4" />}
            />
            <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {areas.map((a) => {
                const p = a.correct / a.total;
                return (
                  <ProgressBar
                    key={a.sub}
                    value={a.correct}
                    max={a.total}
                    size="sm"
                    tone={p >= 0.8 ? 'success' : p >= 0.5 ? 'blue' : 'red'}
                    label={<span className="line-clamp-1">{a.sub}</span>}
                    showValue={(vv, m) => `${vv}/${m}`}
                  />
                );
              })}
            </div>
          </Card>
        )}

        <section aria-label="Question review">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Review</h2>
              <p className="text-sm text-muted">Every question with the right answer and why.</p>
            </div>
            <SegmentedControl<Filter>
              aria-label="Filter questions"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${data.answers.length}` },
                { value: 'missed', label: `Missed ${missed}`, disabled: !missed },
                { value: 'correct', label: `Right ${data.answers.length - missed}`, disabled: missed === data.answers.length },
                ...(flagged ? [{ value: 'flagged' as const, label: `Flagged ${flagged}` }] : []),
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">
              Nothing here.
            </div>
          ) : (
            <ol className="space-y-3">
              {shown.map(({ a, i }) => (
                <ReviewItem key={`${a.question_id}-${i}`} n={i + 1} a={a} q={byQ.get(a.question_id)} showElo={!NO_ELO_KINDS.includes(data.kind)} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="tabular inline-flex h-7 items-center gap-1.5 rounded-full bg-white/12 px-3 text-xs font-semibold text-white ring-1 ring-inset ring-white/15">
      {icon}
      {children}
    </span>
  );
}

function ScoreRing({
  pct,
  correct,
  total,
  animate,
  endless,
}: {
  pct: number;
  correct: number;
  total: number;
  animate: boolean;
  endless: boolean;
}) {
  const shown = useCountUp(endless ? correct : pct * 100, { enabled: animate, duration: 1200, delay: 150 });
  const ringPct = endless ? Math.min(1, correct / Math.max(1, total)) : pct;
  const p = useCountUp(ringPct, { enabled: animate, duration: 1200, delay: 150 });
  const size = 156;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 0.8 ? '#3cc68a' : pct >= 0.5 ? '#7FA3DD' : '#ff6b8e';
  return (
    <div className="relative mx-auto grid shrink-0 place-items-center md:mx-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - p * c}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="tabular font-display text-[2.6rem] font-extrabold leading-none text-white">
            {Math.round(shown)}
            {!endless && <span className="text-xl text-white/70">%</span>}
          </div>
          <div className="tabular mt-1 text-sm font-semibold text-white/70">
            {endless ? `of ${total} correct` : `${correct} / ${total} right`}
          </div>
        </div>
      </div>
    </div>
  );
}

function EloPanel({ data, animate }: { data: ExamResultData; animate: boolean }) {
  const noElo = NO_ELO_KINDS.includes(data.kind);
  const delta = data.eloAfter - data.eloBefore;
  const shown = useCountUp(data.eloAfter, { from: data.eloBefore, enabled: animate, duration: 1400, delay: 450 });
  const before = tierFor(data.eloBefore);
  const after = tierFor(data.eloAfter);
  const path = useMemo(() => {
    const pts = [data.eloBefore];
    let r = data.eloBefore;
    for (const a of data.answers) {
      r += a.elo_delta;
      pts.push(r);
    }
    return pts;
  }, [data]);
  return (
    <div
      className="exam-rise rounded-[14px] bg-white/[0.08] p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm md:col-span-2 lg:col-span-1"
      style={{ animationDelay: '260ms' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">Elo rating</span>
        {!noElo && (
          <span
            className={cn(
              'tabular inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-display text-sm font-bold',
              delta > 0 ? 'bg-[#3cc68a]/20 text-[#7ee2b0]' : delta < 0 ? 'bg-[#ff5a7f]/20 text-[#ff9fb6]' : 'bg-white/10 text-white/80',
              animate && 'exam-pop',
            )}
            style={animate ? { animationDelay: '1700ms' } : undefined}
          >
            {delta > 0 ? <ArrowUpRight className="size-4" /> : delta < 0 ? <ArrowDownRight className="size-4" /> : <Minus className="size-4" />}
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      {noElo ? (
        <p className="mt-3 text-sm text-white/75">
          {data.kind === 'duel' ? 'Arena duels' : 'Chapter tests'} don't change your Elo. Your rating stays at{' '}
          <span className="tabular font-bold text-white">{data.eloAfter}</span>.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <TierGem elo={Math.round(shown)} size={34} />
            <div>
              <div className="tabular font-display text-4xl font-extrabold leading-none text-white">{Math.round(shown)}</div>
              <div className="mt-1 text-xs text-white/70">
                from <span className="tabular">{data.eloBefore}</span> / {after.name} tier
              </div>
            </div>
            {path.length > 2 && (
              <Sparkline
                className="ml-auto"
                values={path}
                width={96}
                height={40}
                color={delta >= 0 ? '#7ee2b0' : '#ff9fb6'}
                title="Elo during this run"
              />
            )}
          </div>
          {after.min !== before.min && (
            <div
              className={cn(
                'mt-3 rounded-lg px-3 py-2 text-sm font-semibold',
                after.min > before.min ? 'bg-[#3cc68a]/15 text-[#7ee2b0]' : 'bg-white/8 text-white/80',
                animate && 'exam-pop',
              )}
              style={animate ? { animationDelay: '1800ms' } : undefined}
            >
              {after.min > before.min ? `Promoted to ${after.name}!` : `Dropped to ${after.name}. Win it back next run.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewItem({ n, a, q, showElo }: { n: number; a: ResultAnswer; q: ExamQuestion | undefined; showElo: boolean }) {
  const [open, setOpen] = useState(!a.correct);
  const correctIdx = a.correct_choice ?? q?.answer ?? null;
  return (
    <li className={cn('overflow-hidden rounded-[12px] border bg-surface', a.correct ? 'border-line' : 'border-red/25')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60"
      >
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white',
            a.correct ? 'bg-success' : 'bg-red',
          )}
          aria-label={a.correct ? 'Correct' : 'Incorrect'}
        >
          {a.correct ? <Check className="size-4" /> : <X className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="tabular font-bold text-heading">Q{n}</span>
            {(a.sub ?? q?.sub) && <span className="truncate">{a.sub ?? q?.sub}</span>}
            {q?.diff && <span>/ {DIFFICULTY_LABELS[q.diff]}</span>}
            {a.ms > 0 && <span className="tabular">/ {(a.ms / 1000).toFixed(1)}s</span>}
            {a.flagged && (
              <Badge tone="red" className="h-5 px-2">
                <Flag className="size-3" /> Flagged
              </Badge>
            )}
          </div>
          <p className={cn('font-medium leading-snug text-ink', !open && 'line-clamp-2')}>
            {q?.q ?? 'This question is no longer available.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showElo && a.elo_delta !== 0 && (
            <span
              className={cn(
                'tabular rounded-full px-2 py-0.5 text-xs font-bold',
                a.elo_delta > 0 ? 'bg-success/10 text-success' : 'bg-red/10 text-red dark:text-danger',
              )}
            >
              {a.elo_delta > 0 ? '+' : ''}
              {a.elo_delta}
            </span>
          )}
          <ChevronDown className={cn('size-4 text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </div>
      </button>
      {open && q && (
        <div className="exam-rise border-t border-line px-4 pb-4 pt-3">
          <ul className="grid gap-1.5">
            {q.choices.map((c, i) => {
              const right = i === correctIdx;
              const mine = i === a.chosen;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm',
                    right ? 'border-success/40 bg-success/[0.07]' : mine ? 'border-red/35 bg-red/[0.05]' : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold',
                      right ? 'bg-success text-white' : mine ? 'bg-red text-white' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {LETTERS[i]}
                  </span>
                  <span className="min-w-0 flex-1 text-ink">{c}</span>
                  {right && <span className="shrink-0 text-xs font-bold text-success">Correct</span>}
                  {mine && !right && <span className="shrink-0 text-xs font-bold text-red dark:text-danger">Your answer</span>}
                </li>
              );
            })}
          </ul>
          {a.chosen == null && <p className="mt-2 text-sm font-semibold text-red dark:text-danger">Left blank.</p>}
          {(a.explain ?? q.explain) && (
            <p className="mt-3 flex gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-ink">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>{a.explain ?? q.explain}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

const CONFETTI_COLORS = ['#BF0D3E', '#FFFFFF', '#3F6FB3', '#FFE08A', '#7FA3DD'];

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: 10 + Math.random() * 30,
        top: 30 + Math.random() * 30,
        dx: `${(Math.random() * 2 - 0.5) * 420}px`,
        dy: `${(Math.random() * 2 - 1.1) * 220}px`,
        rot: `${Math.random() * 720 - 360}deg`,
        delay: Math.random() * 300,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 5 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-[2px]"
          style={
            {
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: b.w,
              height: b.w * 0.45,
              background: b.color,
              '--dx': b.dx,
              '--dy': b.dy,
              '--rot': b.rot,
              animation: `exam-confetti 1600ms cubic-bezier(.2,.7,.3,1) ${b.delay + 300}ms both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
