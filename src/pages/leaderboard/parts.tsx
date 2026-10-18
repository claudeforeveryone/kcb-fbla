// Small presentational pieces shared by the player and chapter boards.
import type { ReactNode } from 'react';
import { Skeleton, cn } from '../../components/ui';
import { fmt } from './data';

const TOP: Record<number, string> = {
  1: 'bg-red text-white',
  2: 'bg-navy text-white dark:bg-blue',
  3: 'bg-navy text-white dark:bg-blue',
};

/** Position number; small solid chip for the top three (1st red, 2nd and 3rd navy). */
export function RankMark({ rank, me, className }: { rank: number; me?: boolean; className?: string }) {
  const top = TOP[rank];
  return (
    <span
      className={cn(
        'tabular grid h-8 min-w-8 shrink-0 place-items-center rounded-none px-1.5 font-display text-sm',
        top ? cn(top, 'font-extrabold') : me ? 'bg-red font-extrabold text-white' : 'font-bold text-heading',
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
  if (!answered) return <span className={cn('text-xs text-ink', className)}>No answers</span>;
  const p = Math.round(value * 100);
  const tone = p >= 80 ? 'bg-success' : p >= 60 ? 'bg-blue' : p >= 40 ? 'bg-warning' : 'bg-red';
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`${p}% correct`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-none bg-surface-3" aria-hidden>
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

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-[68px] items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-8" rounded="rounded-none" />
          <Skeleton className="size-10" rounded="rounded-none" />
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
  const s = { sm: 'size-8 text-[11px] rounded-none', md: 'size-10 text-sm rounded-none', lg: 'size-14 text-lg rounded-none', xl: 'size-20 text-2xl rounded-none' }[size];
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
    <span className="inline-flex h-5 shrink-0 items-center rounded-none bg-red px-2 text-[10px] font-bold uppercase tracking-wider text-white">
      {children}
    </span>
  );
}
