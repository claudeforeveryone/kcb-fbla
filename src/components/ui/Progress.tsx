import type { ReactNode } from 'react';
import { cn } from './cn';

export type ProgressTone = 'navy' | 'red' | 'blue' | 'success' | 'warning';
const fills: Record<ProgressTone, string> = {
  navy: 'bg-navy dark:bg-link',
  red: 'bg-red',
  blue: 'bg-blue',
  success: 'bg-success',
  warning: 'bg-warning',
};
const strokes: Record<ProgressTone, string> = {
  navy: 'var(--heading)',
  red: 'var(--red)',
  blue: 'var(--blue)',
  success: 'var(--success)',
  warning: 'var(--warning)',
};

const pct = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

export function ProgressBar({
  value,
  max = 100,
  tone = 'blue',
  size = 'md',
  label,
  showValue,
  className,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: ReactNode;
  showValue?: boolean | ((value: number, max: number) => ReactNode);
  className?: string;
}) {
  const p = pct(value, max);
  const h = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' }[size];
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          {label && <span className="font-medium text-ink">{label}</span>}
          {showValue && (
            <span className="tabular text-muted">
              {typeof showValue === 'function' ? showValue(value, max) : `${Math.round(p)}%`}
            </span>
          )}
        </div>
      )}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-surface-3', h)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fills[tone])}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressRing({
  value,
  max = 100,
  size = 64,
  stroke = 7,
  tone = 'blue',
  children,
  label,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: ProgressTone;
  /** Centre content; defaults to the percentage. */
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const p = pct(value, max);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokes[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center font-display text-sm font-bold text-heading">
        {children ?? `${Math.round(p)}%`}
      </span>
    </div>
  );
}
