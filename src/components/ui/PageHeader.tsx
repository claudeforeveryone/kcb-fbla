import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from './cn';

/**
 * Decorative angular shards echoing the FBLC logo's facets. Place inside a `relative overflow-hidden`
 * navy container.
 */
export function FacetArt({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const o = (v: number) => Math.min(1, v * intensity);
  // Each shape drifts a few pixels on its own slow loop (see .facet-drift in index.css); flat fills, no gradients.
  const drift = (dur: number, delay: number, x: number, y: number, r: number) =>
    ({ '--facet-dur': `${dur}s`, '--facet-delay': `${delay}s`, '--facet-x': `${x}px`, '--facet-y': `${y}px`, '--facet-r': `${r}deg` }) as CSSProperties;
  return (
    <svg
      className={cn('pointer-events-none absolute inset-y-0 right-0 h-full w-[min(760px,100%)]', className)}
      viewBox="0 0 760 320"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
    >
      {/* big rising shard */}
      <polygon className="facet-drift" style={drift(16, 0, 12, -8, 1.5)} points="430,320 640,40 700,190 560,320" fill="#fff" fillOpacity={o(0.08)} />
      {/* stepped lower plane, like the logo's base */}
      <polygon className="facet-drift" style={drift(19, -6, -10, 4, -0.8)} points="520,320 620,250 650,250 690,200 760,170 760,320" fill="#3F6FB3" fillOpacity={o(0.35)} />
      {/* left wedge */}
      <polygon className="facet-drift" style={drift(13, -3, 8, -10, 2.5)} points="340,320 400,210 470,320" fill="#fff" fillOpacity={o(0.06)} />
      {/* top-right flag plane */}
      <polygon className="facet-drift" style={drift(17, -9, -8, 8, -1.5)} points="610,0 760,0 760,120 700,70" fill="#fff" fillOpacity={o(0.07)} />
      {/* small floating triangles */}
      <polygon className="facet-drift" style={drift(11, -2, 14, -12, 6)} points="300,70 330,40 342,92" fill="#fff" fillOpacity={o(0.09)} />
      <polygon className="facet-drift" style={drift(14, -7, -12, 10, -5)} points="560,120 586,104 584,140" fill="#3F6FB3" fillOpacity={o(0.5)} />
      {/* thin red accent edge */}
      <polygon className="facet-drift" style={drift(16, 0, 12, -8, 1.5)} points="638,45 644,41 705,190 700,194" fill="#BF0D3E" fillOpacity={o(0.9)} />
      {/* fine outline shard */}
      <polyline
        className="facet-drift"
        style={drift(21, -4, 6, -6, 0.8)}
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
            className="mb-3 inline-flex items-center gap-1 rounded-[2px] text-sm font-semibold text-white/75 transition-colors hover:text-white"
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
