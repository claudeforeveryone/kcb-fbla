import { cn } from './cn';

export function Skeleton({ className, rounded = 'rounded-md' }: { className?: string; rounded?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'animate-shimmer block bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--surface-2)_25%,var(--surface-3)_50%,var(--surface-2)_75%)]',
        rounded,
        className ?? 'h-4 w-full',
      )}
    />
  );
}

/** A few lines of text placeholder. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Card-shaped placeholder grid, for page-level loading states. */
export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[12px] border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10" rounded="rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <SkeletonText className="mt-5" lines={2} />
        </div>
      ))}
    </div>
  );
}
