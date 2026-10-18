import { cn } from './cn';

/** The Elo number. There are no rank tiers on this site, only the score. */
export function EloBadge({
  elo,
  size = 'md',
  onDark,
  className,
}: {
  elo: number;
  size?: 'sm' | 'md' | 'lg';
  /** For use on navy bands. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 whitespace-nowrap rounded-none font-display font-bold',
        size === 'sm' && 'h-6 items-center px-2 text-xs',
        size === 'md' && 'h-7 items-center px-2.5 text-sm',
        size === 'lg' && 'h-10 items-center px-3.5 text-lg',
        onDark ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15' : 'bg-surface ring-1 ring-inset ring-line',
        className,
      )}
    >
      <span className={cn('tabular', !onDark && 'text-heading')}>{Math.max(0, Math.round(elo || 0))}</span>
      <span className={cn('text-[0.75em] font-semibold uppercase tracking-wide', onDark ? 'text-white/65' : 'text-muted')}>Elo</span>
    </span>
  );
}
