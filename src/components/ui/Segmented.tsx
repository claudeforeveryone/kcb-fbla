import type { ReactNode } from 'react';
import { cn } from './cn';

export type SegmentOption<T extends string | number> = { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean };

/** Single-choice segmented control (radiogroup). */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  block,
  className,
  'aria-label': ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-0 rounded-none bg-surface-2 p-0.5 ring-1 ring-inset ring-line',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-none font-display font-semibold transition-colors duration-150 ease-out disabled:opacity-40 [&>svg]:size-4',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
              block && 'flex-1',
              active
                ? 'bg-surface text-heading shadow-[inset_0_-2px_0_var(--red)] ring-1 ring-line-strong dark:bg-surface-3'
                : 'text-muted hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A toggleable filter chip. */
export function Pill({
  active,
  onClick,
  children,
  icon,
  className,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-none border px-3 text-sm font-semibold transition-colors duration-150 [&>svg]:size-3.5',
        active
          ? 'border-red bg-red/[0.07] text-red dark:text-danger'
          : 'border-line-strong bg-surface text-ink hover:border-blue/60 hover:text-heading',
        className,
      )}
    >
      {icon}
      {children}
      {/* Full-strength red on the tint (dark mode swaps .text-red for the lighter danger tone): a faded red count fell
          below AA, 1.9:1 in dark mode. */}
      {count != null && <span className={cn('tabular text-xs', active ? 'text-red' : 'text-muted')}>{count}</span>}
    </button>
  );
}
