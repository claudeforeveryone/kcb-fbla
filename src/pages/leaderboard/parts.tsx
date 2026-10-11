// Small presentational pieces shared by the player and chapter boards.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Skeleton, cn } from '../../components/ui';
import { fmt } from './data';

const MEDAL: Record<number, { ring: string; chip: string; label: string }> = {
  1: { ring: 'ring-red', chip: 'bg-red text-white', label: '1st place' },
  2: { ring: 'ring-navy dark:ring-blue', chip: 'border border-heading bg-surface text-heading', label: '2nd place' },
  3: { ring: 'ring-navy dark:ring-blue', chip: 'border border-heading bg-surface text-heading', label: '3rd place' },
};

/** Position number; solid square chip for the top three. */
export function RankMark({ rank, me, className }: { rank: number; me?: boolean; className?: string }) {
  const m = MEDAL[rank];
  if (m)
    return (
      <span
        className={cn('tabular grid size-8 shrink-0 place-items-center rounded-[2px] font-display text-sm font-extrabold', m.chip, className)}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
    );
  return (
    <span
      className={cn(
        'tabular grid h-8 min-w-8 shrink-0 place-items-center rounded-[2px] px-1.5 font-display text-sm font-bold',
        me ? 'bg-red text-white' : 'text-muted',
        className,
      )}
      aria-label={`Rank ${rank}`}
    >
      {rank > 9999 ? `${Math.round(rank / 1000)}k` : rank}
    </span>
  );
}

/** Thin accuracy bar with the percentage. */
export function AccuracyMeter({ value, answered, className }: { value: number; answered: number; className?: string }) {
  if (!answered) return <span className={cn('text-xs text-muted', className)}>No answers</span>;
  const p = Math.round(value * 100);
  const tone = p >= 80 ? 'bg-success' : p >= 60 ? 'bg-blue' : p >= 40 ? 'bg-warning' : 'bg-red';
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`${p}% correct`}>
      <span className="h-1.5 w-12 overflow-hidden bg-surface-3" aria-hidden>
        <span className={cn('block h-full', tone)} style={{ width: `${Math.max(4, p)}%` }} />
      </span>
      <span className="tabular w-9 text-right text-sm font-semibold text-ink">{p}%</span>
    </span>
  );
}

/** Elo number, compact for table rows. */
export function EloCell({ elo, label }: { elo: number; label?: string }) {
  return (
    <span className="inline-flex items-center justify-end" title={label ?? `${Math.round(elo)} Elo`}>
      <span className="tabular font-display text-base font-bold text-heading">{fmt.format(Math.round(elo))}</span>
    </span>
  );
}

export type PodiumEntry = {
  id: string;
  rank: number;
  name: string;
  sub?: ReactNode;
  avatar?: string | null;
  /** Shown big under the name. */
  score: number;
  scoreLabel: string;
  me?: boolean;
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
};

const PLINTH: Record<number, string> = { 1: 'h-28 md:h-32', 2: 'h-20 md:h-24', 3: 'h-16 md:h-[4.5rem]' };

/** Top-three podium: 2nd, 1st, 3rd from left to right. */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  // Slot by list position (ties can share a rank number; the medal follows position).
  const slots = [entries[1], entries[0], entries[2]];
  const place = [2, 1, 3];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Top three">
      {slots.map((e, i) => {
        const p = place[i];
        if (!e)
          return (
            <li key={`empty-${p}`} className="flex flex-col items-center opacity-60" aria-hidden>
              <div className="mb-2 grid size-14 place-items-center rounded-[2px] border-2 border-dashed border-line-strong text-sm font-bold text-muted md:size-16">
                {p}
              </div>
              <div className={cn('w-full rounded-t-xl border border-b-0 border-dashed border-line-strong', PLINTH[p])} />
            </li>
          );
        const medal = MEDAL[p];
        const inner = (
          <>
            <div className="relative mb-2">
              {e.icon ?? (
                <Avatar
                  src={e.avatar}
                  name={e.name}
                  size={p === 1 ? 'xl' : 'lg'}
                  className={cn('ring-4 ring-offset-2 ring-offset-surface', medal.ring)}
                />
              )}
              <span
                className={cn(
                  'tabular absolute grid size-7 place-items-center rounded-[2px] font-display text-xs font-extrabold ring-2 ring-surface',
                  e.icon ? '-right-2 -top-2' : '-bottom-2 -right-2',
                  medal.chip,
                )}
              >
                {e.rank}
              </span>
            </div>
            <div className="mt-2 w-full min-w-0 px-1 text-center">
              <div className={cn('truncate font-display text-sm font-bold text-heading md:text-base', e.me && 'text-red')}>
                {e.name}
                {e.me && <span className="sr-only"> (you)</span>}
              </div>
              {e.sub && <div className="truncate text-xs text-muted">{e.sub}</div>}
            </div>
            <div
              className={cn(
                'relative mt-2 flex w-full flex-col items-center justify-start overflow-hidden rounded-t-xl border border-b-0 border-line border-t-4 pt-2.5',
                PLINTH[p],
                p === 1 || e.me ? 'border-t-red' : 'border-t-heading',
                e.me ? 'bg-red/[0.06]' : 'bg-surface',
              )}
            >
              <span
                className={cn(
                  'relative inline-flex items-center gap-1 font-display text-lg font-extrabold tabular md:text-2xl',
                  p === 1 ? 'text-red' : 'text-heading',
                )}
              >
                {fmt.format(Math.round(e.score))}
              </span>
              <span className="relative text-[10px] font-semibold uppercase tracking-wider text-muted md:text-[11px]">
                {e.scoreLabel}
              </span>
            </div>
          </>
        );
        const cls =
          'group flex w-full flex-col items-center rounded-t-xl outline-none transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:hover:translate-y-0';
        return (
          <li key={e.id} className="flex min-w-0 flex-col items-center" style={{ animationDelay: `${i * 60}ms` }}>
            {e.to ? (
              <Link to={e.to} className={cls} aria-label={`${medal.label}: ${e.name}, ${Math.round(e.score)} ${e.scoreLabel}`}>
                {inner}
              </Link>
            ) : e.onClick ? (
              <button
                type="button"
                onClick={e.onClick}
                className={cls}
                aria-label={`${medal.label}: ${e.name}, ${Math.round(e.score)} ${e.scoreLabel}`}
              >
                {inner}
              </button>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PodiumSkeleton() {
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-hidden>
      {[2, 1, 3].map((p) => (
        <div key={p} className="flex flex-col items-center">
          <Skeleton className={p === 1 ? 'size-20' : 'size-14'} rounded="rounded-full" />
          <Skeleton className="mt-3 h-3.5 w-20" />
          <Skeleton className={cn('mt-3 w-full', PLINTH[p])} rounded="rounded-t-xl" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8" rounded="rounded-[2px]" />
          <Skeleton className="size-10" rounded="rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-16 sm:block" />
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Outlined crest with the chapter's initials and a red slash, echoing the logo's facets. */
export function ChapterCrest({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const letters =
    name
      .replace(/\b(fbla|chapter|the|of)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || name.slice(0, 2).toUpperCase();
  const s = { sm: 'size-8 text-[11px] rounded-[2px]', md: 'size-10 text-sm rounded-[2px]', lg: 'size-14 text-lg rounded-[4px]', xl: 'size-20 text-2xl rounded-[4px]' }[size];
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden border border-line-strong bg-surface font-display font-extrabold text-heading', s, className)}
      aria-hidden
    >
      <span className="absolute -right-1 top-0 h-[140%] w-[3px] rotate-[22deg] bg-red/90" />
      <span className="relative">{letters}</span>
    </span>
  );
}

/** Small solid red "You" / "Yours" tag. */
export function YouTag({ children = 'You' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[2px] bg-red px-2 text-[10px] font-bold uppercase tracking-wider text-white">
      {children}
    </span>
  );
}
