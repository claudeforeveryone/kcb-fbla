import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

export function EmptyState({
  icon: _icon,
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
        'flex flex-col items-start border-l-2 border-line-strong pl-4 text-left',
        compact ? 'py-1' : 'py-2',
        className,
      )}
    >
      <h3 className="text-[0.9375rem] font-bold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
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
      className={cn('flex flex-col items-center rounded-none border border-red/20 bg-red/[0.04] px-6 py-10 text-center', className)}
    >
      <AlertTriangle className="mb-3 size-5 text-red dark:text-danger" aria-hidden />
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
