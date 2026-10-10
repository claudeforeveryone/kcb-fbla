import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button or ButtonLink: the helpful next step. */
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[12px] border border-dashed border-line-strong bg-surface/60 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon && (
        <div className="relative mb-4 grid size-14 place-items-center">
          <span className="absolute inset-0 rotate-6 rounded-2xl bg-blue/10" aria-hidden />
          <span className="absolute inset-0 -rotate-3 rounded-2xl bg-navy/5 dark:bg-white/5" aria-hidden />
          <span className="relative text-navy dark:text-link [&>svg]:size-6">{icon}</span>
        </div>
      )}
      <h3 className="text-base font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  className,
}: {
  title?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const msg =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'We could not load this right now. Check your connection and try again.';
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center rounded-[12px] border border-red/20 bg-red/[0.04] px-6 py-10 text-center', className)}
    >
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-red/10 text-red dark:text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{msg}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} leftIcon={<RefreshCw className="size-3.5" />}>
          Try again
        </Button>
      )}
    </div>
  );
}
