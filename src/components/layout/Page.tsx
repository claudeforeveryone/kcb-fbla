import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

/** Standard content container under a PageHeader (or on its own). */
export function Page({
  children,
  width = 'default',
  className,
  flush,
}: {
  children: ReactNode;
  width?: 'narrow' | 'default' | 'wide';
  className?: string;
  /** Remove top padding, e.g. when content overlaps the header band. */
  flush?: boolean;
}) {
  const w = { narrow: 'max-w-3xl', default: 'max-w-6xl', wide: 'max-w-7xl' }[width];
  return (
    <div className={cn('animate-rise mx-auto w-full px-4 sm:px-6', w, flush ? 'pb-8' : 'py-6 md:py-8', className)}>
      {children}
    </div>
  );
}

/** Section heading inside a page. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-8 first:mt-0', className)}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
