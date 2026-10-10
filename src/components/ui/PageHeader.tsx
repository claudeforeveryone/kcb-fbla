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
    // Spans the whole banner. The right side carries the main cluster; shapes behind the text on the left are fainter.
    <svg
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
    >
      {/* far left: low planes and drifting slivers */}
      <polygon className="facet-drift" style={drift(18, -5, 10, -6, 1)} points="0,320 0,200 120,320" fill="var(--facet-ink, #fff)" fillOpacity={o(0.05)} />
      <polygon className="facet-drift" style={drift(22, -11, -8, 6, -1)} points="0,0 180,0 60,90" fill="#3F6FB3" fillOpacity={o(0.22)} />
      <polygon className="facet-drift" style={drift(12, -1, 12, -10, 5)} points="150,190 178,168 186,212" fill="var(--facet-ink, #fff)" fillOpacity={o(0.08)} />
      <polygon className="facet-drift" style={drift(15, -8, -10, 8, -4)} points="250,40 268,22 280,58" fill="#3F6FB3" fillOpacity={o(0.4)} />
      <polygon className="facet-drift" style={drift(20, -3, 8, -8, 1.5)} points="200,320 330,170 380,320" fill="#3F6FB3" fillOpacity={o(0.18)} />
      {/* middle band */}
      <polygon className="facet-drift" style={drift(17, -6, -12, 6, -1.2)} points="420,0 600,0 520,110" fill="var(--facet-ink, #fff)" fillOpacity={o(0.05)} />
      <polygon className="facet-drift" style={drift(13, -4, 14, -10, 6)} points="560,240 594,214 600,262" fill="var(--facet-ink, #fff)" fillOpacity={o(0.09)} />
      <polygon className="facet-drift" style={drift(19, -9, 10, -6, 1)} points="620,320 760,150 820,320" fill="var(--facet-ink, #fff)" fillOpacity={o(0.05)} />
      <polygon className="facet-drift" style={drift(14, -2, -14, 10, -5)} points="760,60 784,44 790,82" fill="#BF0D3E" fillOpacity={o(0.55)} />
      <polygon className="facet-drift" style={drift(16, -12, 8, 8, 2)} points="880,0 980,0 940,70" fill="#3F6FB3" fillOpacity={o(0.3)} />
      {/* right cluster: big rising shard, stepped base like the logo, flag plane, red edge */}
      <polygon className="facet-drift" style={drift(16, 0, 12, -8, 1.5)} points="1110,320 1320,40 1380,190 1240,320" fill="var(--facet-ink, #fff)" fillOpacity={o(0.08)} />
      <polygon className="facet-drift" style={drift(19, -6, -10, 4, -0.8)} points="1200,320 1300,250 1330,250 1370,200 1440,170 1440,320" fill="#3F6FB3" fillOpacity={o(0.35)} />
      <polygon className="facet-drift" style={drift(13, -3, 8, -10, 2.5)} points="1020,320 1080,210 1150,320" fill="var(--facet-ink, #fff)" fillOpacity={o(0.06)} />
      <polygon className="facet-drift" style={drift(17, -9, -8, 8, -1.5)} points="1290,0 1440,0 1440,120 1380,70" fill="var(--facet-ink, #fff)" fillOpacity={o(0.07)} />
      <polygon className="facet-drift" style={drift(11, -2, 14, -12, 6)} points="980,70 1010,40 1022,92" fill="var(--facet-ink, #fff)" fillOpacity={o(0.09)} />
      <polygon className="facet-drift" style={drift(14, -7, -12, 10, -5)} points="1240,120 1266,104 1264,140" fill="#3F6FB3" fillOpacity={o(0.5)} />
      <polygon className="facet-drift" style={drift(16, 0, 12, -8, 1.5)} points="1318,45 1324,41 1385,190 1380,194" fill="#BF0D3E" fillOpacity={o(0.9)} />
      {/* fine outline shards */}
      <polyline className="facet-drift" style={drift(21, -4, 6, -6, 0.8)} points="930,320 1200,60 1240,150" fill="none" stroke="var(--facet-ink, #fff)" strokeOpacity={o(0.12)} strokeWidth="1.5" />
      <polyline className="facet-drift" style={drift(24, -10, -6, 6, -0.6)} points="380,320 560,90 610,170" fill="none" stroke="var(--facet-ink, #fff)" strokeOpacity={o(0.08)} strokeWidth="1.5" />
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
    <header className={cn('band relative isolate z-10 text-white', className)}>
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
