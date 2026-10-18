import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Skeleton, cn } from '../../components/ui';
import { ATTEMPT_KIND_LABELS, eventInfo, eventName, type Attempt, type WeakSpot } from '../../lib/types';
import { runLink, timeAgo } from './homeData';

const MIN_ANSWERS = 3;

function accTone(acc: number) {
  if (acc >= 0.8) return { bar: 'bg-success', text: 'text-success' };
  if (acc >= 0.6) return { bar: 'bg-warning', text: 'text-[#8a5f00] dark:text-warning' };
  return { bar: 'bg-red', text: 'text-red dark:text-danger' };
}

/** The member's worst competency areas, each with a one-click drill. */
export function WeakSpots({
  spots,
  loading,
  error,
  onRetry,
  answered,
}: {
  spots: WeakSpot[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  answered: number;
}) {
  const list = (spots ?? []).filter((s) => s.answered >= MIN_ANSWERS && s.accuracy < 0.8).slice(0, 4);
  const tracked = (spots ?? []).filter((s) => s.answered >= MIN_ANSWERS).length;

  return (
    <Card>
      <CardHeader
        title="Weak spots"
        subtitle="Areas where you drop the most marks"
        action={
          list.length > 0 ? (
            <ButtonLink to={runLink({ kind: 'weak', n: 10 })} size="sm" variant="secondary">
              Drill all
            </ButtonLink>
          ) : undefined
        }
      />
      {error && !spots ? (
        <ErrorState title="Couldn't load weak spots" error={error} onRetry={onRetry} className="py-6" />
      ) : loading && !spots ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          compact
          title={answered === 0 ? 'Nothing to fix yet' : tracked === 0 ? 'Keep going' : 'No weak spots right now'}
          description={
            answered === 0
              ? 'Answer a few sets and we will show the areas costing you the most marks.'
              : tracked === 0
                ? `We need at least ${MIN_ANSWERS} answers in an area before we call it a weak spot.`
                : 'You are scoring 80% or better in every area you have practised. Try a new event or a mock exam.'
          }
          action={
            <ButtonLink to={answered === 0 ? runLink({ kind: 'practice', n: 10 }) : '/play'} size="sm">
              {answered === 0 ? 'Answer 10 questions' : 'Browse events'}
            </ButtonLink>
          }
        />
      ) : (
        <ul className="-mx-2 space-y-1">
          {list.map((s) => {
            const tone = accTone(s.accuracy);
            const ev = eventInfo(s.event);
            return (
              <li key={`${s.event}|${s.sub}`}>
                <Link
                  to={runLink({ kind: 'area', event: s.event, sub: s.sub, n: 10 })}
                  className="group block rounded-none px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone="navy" className="h-5 shrink-0 px-1.5 text-[0.65rem] tracking-wide">
                      {ev?.short ?? s.event}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">{s.sub}</span>
                    <span className={cn('tabular text-sm font-bold', tone.text)}>{Math.round(s.accuracy * 100)}%</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-link opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:hidden">
                      Drill <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden bg-surface-3">
                      <div className={cn('h-full', tone.bar)} style={{ width: `${Math.max(4, s.accuracy * 100)}%` }} />
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted">
                      {s.correct}/{s.answered} right
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Last few runs, each linking to its review. */
export function RecentAttempts({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: Attempt[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Recent runs"
        subtitle="Tap one to review your answers"
        action={
          <Link to="/me/career" className="link text-sm">
            Career
          </Link>
        }
      />
      {error && !rows ? (
        <ErrorState title="Couldn't load your runs" error={error} onRetry={onRetry} className="py-6" />
      ) : loading && !rows ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-none" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          compact
          title="No runs yet"
          description="Your practice sets, daily challenges and duels will show up here."
          action={
            <ButtonLink to={runLink({ kind: 'practice', n: 10 })} size="sm">
              Quick 10
            </ButtonLink>
          }
        />
      ) : (
        <ul className="-mx-2">
          {rows.map((a) => {
            const pct = a.total ? a.correct / a.total : 0;
            const tone = accTone(pct);
            const delta = a.elo_after - a.elo_before;
            return (
              <li key={a.id}>
                <Link
                  to={`/play/review/${a.id}`}
                  className="group flex items-center gap-3 rounded-none px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <ScoreChip pct={pct} className={tone.text} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-heading">
                      {a.label || (a.event ? eventName(a.event) : ATTEMPT_KIND_LABELS[a.kind])}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{ATTEMPT_KIND_LABELS[a.kind] ?? a.kind}</span>
                      <span aria-hidden>·</span>
                      <span className="tabular">
                        {a.correct}/{a.total}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(a.created_at)}</span>
                    </div>
                  </div>
                  {delta !== 0 && (
                    <span
                      className={cn(
                        'tabular shrink-0 rounded-none px-1.5 py-0.5 text-xs font-bold',
                        delta > 0 ? 'bg-success/10 text-success' : 'bg-red/10 text-red dark:text-danger',
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ScoreChip({ pct, className }: { pct: number; className?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn('relative grid size-11 shrink-0 place-items-center', className)}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
                    strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <span className="tabular text-[0.7rem] font-extrabold">{Math.round(pct * 100)}</span>
    </span>
  );
}
