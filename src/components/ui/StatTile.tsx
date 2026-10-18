import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from './cn';

export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaSuffix = '',
  icon: _icon,
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
        'relative flex flex-col border-t pt-3',
        navy ? 'border-t-2 border-red' : 'border-line-strong',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              'tabular font-display text-[1.75rem] font-extrabold leading-none tracking-tight',
              navy ? 'text-red' : 'text-heading',
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
                    delta > 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {delta > 0 ? '+' : ''}
                  {delta}
                  {deltaSuffix}
                </span>
              )}
              {sub && <span className="text-muted">{sub}</span>}
            </div>
          )}
        </div>
        {chart && <div className="shrink-0">{chart}</div>}
      </div>
    </div>
  );
}
