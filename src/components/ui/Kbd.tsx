import type { ReactNode } from 'react';
import { cn } from './cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded-[2px] border border-line-strong bg-surface px-1 font-sans text-[11px] font-semibold text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
