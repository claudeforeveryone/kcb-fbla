import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'navy' | 'red' | 'blue' | 'success' | 'warning';

const soft: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted ring-line',
  navy: 'bg-navy/8 text-navy ring-navy/15 dark:bg-blue/20 dark:text-link dark:ring-blue/30',
  red: 'bg-red/10 text-red ring-red/20 dark:text-danger',
  // Text a shade darker than the brand colour so a 12px label clears 4.5:1 on its tint (blue 5.7:1, success 6.2:1).
  blue: 'bg-blue/10 text-[color-mix(in_srgb,var(--blue)_85%,black)] ring-blue/20 dark:text-link',
  success: 'bg-success/10 text-[color-mix(in_srgb,var(--success)_72%,black)] ring-success/25 dark:text-success',
  warning: 'bg-warning/12 text-[#8a5f00] ring-warning/30 dark:text-warning',
};
const solid: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-white ring-transparent',
  navy: 'bg-surface text-navy ring-navy/50 dark:text-link dark:ring-link/50',
  red: 'bg-red text-white ring-transparent',
  blue: 'bg-blue text-white ring-transparent',
  success: 'bg-success text-white ring-transparent',
  warning: 'bg-warning text-white ring-transparent',
};

export function Badge({
  tone = 'neutral',
  solid: isSolid,
  dot,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; solid?: boolean; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-none px-2 text-xs font-semibold ring-1 ring-inset',
        isSolid ? solid[tone] : soft[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className="size-1.5 bg-current" aria-hidden />}
      {children}
    </span>
  );
}
