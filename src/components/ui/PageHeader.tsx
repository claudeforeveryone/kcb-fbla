import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from './cn';

/**
 * Decorative angular shards echoing the FBLC logo's facets. Place inside a `relative overflow-hidden`
 * navy container.
 */
export function FacetArt({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const o = (v: number) => Math.min(1, v * intensity);
  return (
    <svg
      className={cn('pointer-events-none absolute inset-y-0 right-0 h-full w-[min(760px,100%)]', className)}
      viewBox="0 0 760 320"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="fa-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={o(0.14)} />
          <stop offset="1" stopColor="#fff" stopOpacity={o(0.02)} />
        </linearGradient>
        <linearGradient id="fa-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3F6FB3" stopOpacity={o(0.55)} />
          <stop offset="1" stopColor="#3F6FB3" stopOpacity={o(0.05)} />
        </linearGradient>
      </defs>
      {/* big rising shard */}
      <polygon points="430,320 640,40 700,190 560,320" fill="url(#fa-a)" />
      {/* stepped lower plane, like the logo's base */}
      <polygon points="520,320 620,250 650,250 690,200 760,170 760,320" fill="url(#fa-b)" />
      {/* left wedge */}
      <polygon points="340,320 400,210 470,320" fill="#fff" fillOpacity={o(0.06)} />
      {/* top-right flag plane */}
      <polygon points="610,0 760,0 760,120 700,70" fill="#fff" fillOpacity={o(0.07)} />
      {/* thin red accent edge */}
      <polygon points="638,45 644,41 705,190 700,194" fill="#BF0D3E" fillOpacity={o(0.9)} />
      {/* fine outline shard */}
      <polyline
        points="250,320 520,60 560,150"
        fill="none"
        stroke="#fff"
        strokeOpacity={o(0.12)}
        strokeWidth="1.5"
      />
    </svg>
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
    // Only the art is clipped, so menus opened from header actions can overflow the band; z-10 keeps them above
    // the page content that follows.
    <header className={cn('facets relative isolate z-10 text-white', className)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <FacetArt className="opacity-90 max-md:opacity-50" />
      </div>
      <div className={cn('relative mx-auto w-full max-w-6xl px-4 sm:px-6', pad)}>
        {back && (
          <Link
            to={back.to}
            className="mb-3 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-white/75 transition-colors hover:text-white"
          >
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {leading}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                  <span className="h-[3px] w-5 rounded-full bg-red" aria-hidden />
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
