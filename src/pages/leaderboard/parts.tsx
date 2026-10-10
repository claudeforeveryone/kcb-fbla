// Small presentational pieces shared by the player and chapter boards.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { Avatar, Skeleton, TierGem, cn, tierFor } from '../../components/ui';
import { fmt } from './data';

const MEDAL: Record<number, { ring: string; chip: string; label: string }> = {
  1: { ring: 'ring-[#E7B416]', chip: 'bg-gradient-to-br from-[#FFE58A] to-[#D9A400] text-[#5A4100]', label: 'Gold' },
  2: { ring: 'ring-[#AEB8C8]', chip: 'bg-gradient-to-br from-[#F1F4F8] to-[#A3AEBF] text-[#3B4454]', label: 'Silver' },
  3: { ring: 'ring-[#C9824B]', chip: 'bg-gradient-to-br from-[#F2B98C] to-[#A9612E] text-[#4A2508]', label: 'Bronze' },
};

/** Rank number; medal chip for the top three. */
export function RankMark({ rank, me, className }: { rank: number; me?: boolean; className?: string }) {
  const m = MEDAL[rank];
  if (m)
    return (
      <span
        className={cn('tabular grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold shadow-sm', m.chip, className)}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
    );
  return (
    <span
      className={cn(
        'tabular grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-1.5 font-display text-sm font-bold',
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
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(4, p)}%` }} />
      </span>
      <span className="tabular w-9 text-right text-sm font-semibold text-ink">{p}%</span>
    </span>
  );
}

/** Elo number with a tier gem, compact for table rows. */
export function EloCell({ elo, label, gem = true }: { elo: number; label?: string; gem?: boolean }) {
  const t = tierFor(elo);
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={label ?? `${t.name} tier`}>
      {gem && <TierGem elo={elo} size={16} />}
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
  /** Elo used for the tier gem; omit to hide. */
  tierElo?: number;
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
              <div className="mb-2 grid size-14 place-items-center rounded-full border-2 border-dashed border-line-strong text-sm font-bold text-muted md:size-16">
                {p}
              </div>
              <div className={cn('w-full rounded-t-xl border border-b-0 border-dashed border-line-strong', PLINTH[p])} />
            </li>
          );
        const medal = MEDAL[p];
        const inner = (
          <>
            <div className="relative mb-2">
              {p === 1 && (
                <Crown
                  className="animate-rise absolute -top-6 left-1/2 size-6 -translate-x-1/2 fill-[#F5C842] text-[#C79A00] md:-top-7 md:size-7"
                  aria-hidden
                />
              )}
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
                  'tabular absolute grid size-7 place-items-center rounded-full font-display text-xs font-extrabold shadow ring-2 ring-surface',
                  e.icon ? '-right-2 -top-2' : '-bottom-1.5 left-1/2 -translate-x-1/2',
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
                'relative mt-2 flex w-full flex-col items-center justify-start overflow-hidden rounded-t-xl pt-2.5 text-white',
                PLINTH[p],
                p === 1 ? 'bg-navy' : 'bg-navy/85 dark:bg-navy-2',
                e.me && 'shadow-[inset_0_3px_0_var(--red)]',
              )}
            >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.14)_0%,transparent_45%,rgb(63_111_179/0.35)_100%)]" aria-hidden />
              <span className="relative inline-flex items-center gap-1 font-display text-lg font-extrabold tabular md:text-2xl">
                {e.tierElo != null && <TierGem elo={e.tierElo} size={18} />}
                {fmt.format(Math.round(e.score))}
              </span>
              <span className="relative text-[10px] font-semibold uppercase tracking-wider text-white/65 md:text-[11px]">
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
          <Skeleton className="size-8" rounded="rounded-full" />
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

/** Navy crest with the chapter's initials, echoing the logo's facets. */
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
  const s = { sm: 'size-8 text-[11px] rounded-lg', md: 'size-10 text-sm rounded-xl', lg: 'size-14 text-lg rounded-2xl', xl: 'size-20 text-2xl rounded-2xl' }[size];
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden bg-navy font-display font-extrabold text-white', s, className)}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_52%,rgb(63_111_179/0.7)_52%,rgb(63_111_179/0.25))]" />
      <span className="absolute -right-1 top-0 h-[140%] w-[3px] rotate-[22deg] bg-red/90" />
      <span className="relative">{letters}</span>
    </span>
  );
}

/** Small solid red "You" / "Yours" tag. */
export function YouTag({ children = 'You' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-red px-2 text-[10px] font-bold uppercase tracking-wider text-white">
      {children}
    </span>
  );
}
