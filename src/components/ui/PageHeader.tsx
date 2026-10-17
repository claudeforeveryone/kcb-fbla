import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from './cn';

/**
 * The FBLA United rule: the shield's navy, red and blue as one thin bar along the bottom edge of a banner or panel.
 * The only decoration banners carry. Place inside a `relative` container. The bar draws in once, left to right.
 */
export function UnitedRule({ className, onNavy = false }: { className?: string; onNavy?: boolean }) {
  return (
    <div className={cn('united-rule pointer-events-none absolute inset-x-0 bottom-0 flex h-[3px]', className)} aria-hidden>
      <span className={cn('flex-[5]', onNavy ? 'bg-white' : 'bg-[var(--heading)]')} />
      <span className="flex-1 bg-red" />
      <span className="flex-[3] bg-blue" />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  back,
  leading,
  size = 'md',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons at the right (stack under the title on phones). Use variant="inverse" / "accent". */
  actions?: ReactNode;
  /** Extra content under the title row, e.g. stat chips or tabs. */
  children?: ReactNode;
  back?: { to: string; label: string };
  /** e.g. an Avatar shown before the title. */
  leading?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const pad = { sm: 'pt-6 pb-6', md: 'pt-8 pb-9 md:pt-10 md:pb-11', lg: 'pt-10 pb-12 md:pt-14 md:pb-16' }[size];
  return (
    // Nothing is clipped, so menus opened from header actions can overflow the band; z-10 keeps them above the page
    // content that follows.
    <header className={cn('band relative isolate z-10 text-white', className)}>
      <UnitedRule />
      <div className={cn('relative mx-auto w-full max-w-[1440px] lg:px-10 px-4 sm:px-6', pad)}>
        {back && (
          <Link
            to={back.to}
            className="mb-3 inline-flex items-center gap-1 rounded-[2px] text-sm font-semibold text-white/75 transition-colors hover:text-white"
          >
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-col gap-5 animate-rise motion-reduce:animate-none md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {leading}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                  <span className="h-[3px] w-5 bg-red" aria-hidden />
                  {eyebrow}
                </div>
              )}
              <h1
                className={cn(
                  'font-extrabold tracking-tight text-white',
                  size === 'lg' ? 'text-3xl md:text-5xl' : size === 'sm' ? 'text-2xl' : 'text-[1.75rem] md:text-4xl',
                )}
              >
                {title}
              </h1>
              {subtitle && <p className="mt-2 max-w-2xl text-[0.9375rem] text-white/75 md:text-base">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}
