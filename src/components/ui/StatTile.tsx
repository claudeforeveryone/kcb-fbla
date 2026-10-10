import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from './cn';

export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaSuffix = '',
  icon,
  chart,
  tone = 'default',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Signed change; positive is green, negative red. */
  delta?: number | null;
  deltaSuffix?: string;
  icon?: ReactNode;
  /** e.g. a <Sparkline/>. */
  chart?: ReactNode;
  tone?: 'default' | 'navy';
  className?: string;
}) {
  const navy = tone === 'navy';
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[12px] border p-4',
        navy ? 'facets border-white/10 text-white' : 'border-line bg-surface',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              'grid size-7 place-items-center rounded-lg [&>svg]:size-4',
              navy ? 'bg-white/12 text-white' : 'bg-navy/7 text-navy dark:bg-blue/20 dark:text-link',
            )}
          >
            {icon}
          </span>
        )}
        <span className={cn('text-xs font-semibold uppercase tracking-wider', navy ? 'text-white/70' : 'text-muted')}>
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              'tabular font-display text-[1.75rem] font-extrabold leading-none tracking-tight',
              navy ? 'text-white' : 'text-heading',
            )}
          >
            {value}
          </div>
          {(sub || (delta != null && delta !== 0)) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {delta != null && delta !== 0 && (
                <span
                  className={cn(
                    'tabular inline-flex items-center gap-0.5 font-semibold',
                    delta > 0 ? (navy ? 'text-[#7ee2b0]' : 'text-success') : navy ? 'text-[#ff9fb6]' : 'text-danger',
                  )}
                >
                  {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {delta > 0 ? '+' : ''}
                  {delta}
                  {deltaSuffix}
                </span>
              )}
              {sub && <span className={navy ? 'text-white/70' : 'text-muted'}>{sub}</span>}
            </div>
          )}
        </div>
        {chart && <div className="shrink-0">{chart}</div>}
      </div>
    </div>
  );
}
