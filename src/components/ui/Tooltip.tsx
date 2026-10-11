import { useId, type ReactNode } from 'react';
import { cn } from './cn';

/** Hover/focus tooltip. Wrap a focusable element. Pure CSS, no positioning library. */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn('group/tt relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[75] w-max max-w-60 -translate-x-1/2 rounded-[2px] border border-line-strong bg-surface px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-ink shadow-pop opacity-0 transition-[opacity,transform] duration-150 ease-out',
          'group-focus-within/tt:opacity-100 group-hover/tt:opacity-100',
          side === 'top'
            ? 'bottom-[calc(100%+6px)] translate-y-1 group-focus-within/tt:translate-y-0 group-hover/tt:translate-y-0'
            : 'top-[calc(100%+6px)] -translate-y-1 group-focus-within/tt:translate-y-0 group-hover/tt:translate-y-0',
        )}
      >
        {content}
      </span>
    </span>
  );
}
