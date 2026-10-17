import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from './cn';

/**
 * The FBLA United banner art: a sash of navy, red and blue stripes sweeping up the right edge, the shield's chevrons
 * rising behind it, and a faint dot grid. Flat fills only. `--facet-ink` is navy on the white page band and white on
 * navy panels. Place inside a `relative overflow-hidden` container.
 */
export function FacetArt({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const o = (v: number) => Math.min(1, v * intensity);
  // Each shape moves a few pixels on its own slow loop (see .facet-drift in index.css).
  const drift = (dur: number, delay: number, x: number, y: number, r: number) =>
    ({ '--facet-dur': `${dur}s`, '--facet-delay': `${delay}s`, '--facet-x': `${x}px`, '--facet-y': `${y}px`, '--facet-r': `${r}deg` }) as CSSProperties;
  // One chevron of the shield, 120 wide and 36 thick, its tip at (x, y).
  const chevron = (x: number, y: number, s = 1) =>
    `${x - 60 * s},${y + 46 * s} ${x},${y} ${x + 60 * s},${y + 46 * s} ${x + 60 * s},${y + 82 * s} ${x},${y + 36 * s} ${x - 60 * s},${y + 82 * s}`;
  const rise = (i: number) => ({ '--rise-delay': `${-i * 1.6}s` }) as CSSProperties;
  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
    >
      <defs>
        <pattern id="united-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="var(--facet-ink, #fff)" />
        </pattern>
      </defs>
      {/* dot grid over the right half, fading out in steps toward the text */}
      <rect x="560" y="0" width="300" height="320" fill="url(#united-dots)" opacity={o(0.05)} />
      <rect x="860" y="0" width="580" height="320" fill="url(#united-dots)" opacity={o(0.1)} />

      {/* the shield's chevrons, large and faint, rising in turn */}
      <g className="max-md:hidden">
        {(['var(--facet-ink, #fff)', '#BF0D3E', '#3F6FB3'] as const).map((fill, i) => (
          <polygon key={i} className="united-rise" style={rise(i)} points={chevron(900, 34 + i * 76, 1.3)} fill={fill} fillOpacity={o([0.08, 0.13, 0.16][i])} />
        ))}
      </g>

      {/* the sash: wide navy, thin red, mid blue, a white sliver between, all at the same angle */}
      <polygon className="facet-drift" style={drift(16, -4, 10, -4, 0)} points="1010,330 1150,330 1350,-10 1210,-10" fill="var(--navy, #001E60)" fillOpacity={o(0.95)} />
      <polygon className="facet-drift" style={drift(16, -4, 10, -4, 0)} points="1168,330 1198,330 1398,-10 1368,-10" fill="#BF0D3E" fillOpacity={o(1)} />
      <polygon className="facet-drift" style={drift(18, -9, -8, 5, 0)} points="1216,330 1330,330 1530,-10 1416,-10" fill="#3F6FB3" fillOpacity={o(0.9)} />
      <polygon className="facet-drift" style={drift(13, -2, 12, -6, 0)} points="1348,330 1366,330 1566,-10 1548,-10" fill="var(--navy, #001E60)" fillOpacity={o(0.35)} />

      {/* sparks: small flat shards around the sash */}
      <polygon className="facet-drift" style={drift(11, -3, 10, -10, 8)} points="1080,64 1112,40 1104,92" fill="#BF0D3E" fillOpacity={o(0.85)} />
      <polygon className="facet-drift" style={drift(14, -7, -12, 8, -6)} points="1000,236 1026,214 1032,262" fill="#3F6FB3" fillOpacity={o(0.7)} />
      <polygon className="facet-drift" style={drift(12, -5, 8, 10, 5)} points="1386,250 1410,232 1414,276" fill="var(--facet-ink, #fff)" fillOpacity={o(0.3)} />
      <polygon className="facet-drift max-md:hidden" style={drift(15, -1, -10, -8, -4)} points="760,40 782,26 786,64" fill="#3F6FB3" fillOpacity={o(0.35)} />
      <polygon className="facet-drift max-md:hidden" style={drift(17, -11, 12, 6, 4)} points="690,250 706,238 710,270" fill="#BF0D3E" fillOpacity={o(0.3)} />
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
        {/* Phones get the sash's colours as a bar along the bottom instead, so nothing sits behind the heading. */}
        <FacetArt className="max-md:hidden" />
        <div className="absolute inset-x-0 bottom-0 flex h-[5px] md:hidden">
          <span className="flex-[5] bg-[var(--navy)] dark:bg-white/30" />
          <span className="flex-1 bg-red" />
          <span className="flex-[3] bg-blue" />
        </div>
      </div>
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
          {actions && (
            // From md up the actions sit on a small surface panel so they stay readable over the sash.
            <div className="flex shrink-0 flex-wrap gap-2 md:rounded-[4px] md:bg-surface md:p-2 md:shadow-sm md:ring-1 md:ring-line">
              {actions}
            </div>
          )}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}
