// One colour and one icon per event, shared by Vocab, Play and anywhere an event needs an identity.
// Colours are all dark enough for white text (WCAG AA at the sizes we use).
import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BrainCircuit,
  Briefcase,
  Calculator,
  CandlestickChart,
  ConciergeBell,
  Globe,
  Hospital,
  Lightbulb,
  Megaphone,
  Network,
  PiggyBank,
  Rocket,
  Scale,
  TrendingUp,
  Trophy,
} from 'lucide-react';

export type EventStyle = { color: string; icon: LucideIcon };

export const EVENT_STYLE: Record<string, EventStyle> = {
  accounting: { color: '#1E7A4C', icon: Calculator },
  'business-law': { color: '#4B3F8F', icon: Scale },
  economics: { color: '#B45309', icon: TrendingUp },
  'data-science-ai': { color: '#0E7490', icon: BrainCircuit },
  'healthcare-administration': { color: '#0F766E', icon: Hospital },
  'intro-business-concepts': { color: '#3F6FB3', icon: Lightbulb },
  'organizational-leadership': { color: '#BE185D', icon: Network },
  'personal-finance': { color: '#4D7C0F', icon: PiggyBank },
  'securities-investments': { color: '#0B4F8A', icon: CandlestickChart },
  'business-management': { color: '#A21CAF', icon: Briefcase },
  entrepreneurship: { color: '#9A6700', icon: Rocket },
  'hospitality-event-management': { color: '#C2410C', icon: ConciergeBell },
  'international-business': { color: '#0369A1', icon: Globe },
  marketing: { color: '#BF0D3E', icon: Megaphone },
  'sports-entertainment-management': { color: '#6D28D9', icon: Trophy },
};

const FALLBACK: EventStyle = { color: '#001E60', icon: Briefcase };

export function eventStyle(slug: string | null | undefined): EventStyle {
  return (slug && EVENT_STYLE[slug]) || FALLBACK;
}

/**
 * A solid white disc holding the icon in `color`, with a flat translucent outer ring.
 * Meant to sit on a block of `color` (like a team crest). White is literal so dark mode can't flip it.
 */
export function Crest({
  icon: Icon,
  color,
  size = 72,
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: number;
  className?: string;
}) {
  const ring = Math.max(3, Math.round(size * 0.07));
  return (
    <span
      className={'relative grid shrink-0 place-items-center rounded-full ' + (className ?? '')}
      style={{ width: size, height: size, background: '#fff', color, boxShadow: `0 0 0 ${ring}px rgb(255 255 255 / 0.24)` }}
      aria-hidden
    >
      <Icon style={{ width: '56%', height: '56%' }} strokeWidth={2.25} />
    </span>
  );
}

/** The event's crest: its icon in its colour on a white disc. Place on the event's colour. */
export function EventCrest({ slug, size = 72, className }: { slug: string; size?: number; className?: string }) {
  const { icon, color } = eventStyle(slug);
  return <Crest icon={icon} color={color} size={size} className={className} />;
}

// Ambient drift for ColorBlock: the facets slide a few percent and the watermark bobs and tilts, on long
// alternating ease-in-out loops of different lengths per layer. Only transform is animated. The watermark's
// resting offset/tilt come from Tailwind v4's `translate`/`rotate` properties, which compose with `transform`.
const COLOR_BLOCK_CSS = `
@keyframes cb-facet-a { from { transform: translate3d(-2.5%, -1%, 0) } to { transform: translate3d(2.5%, 1.5%, 0) } }
@keyframes cb-facet-b { from { transform: translate3d(2%, 1%, 0) } to { transform: translate3d(-3%, -1.5%, 0) } }
@keyframes cb-mark { from { transform: translate3d(0, 2.5%, 0) rotate(-2deg) } to { transform: translate3d(-1.5%, -2.5%, 0) rotate(2.5deg) } }
.cb-facet-a, .cb-facet-b, .cb-mark {
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  animation-delay: var(--cb-delay, 0s);
}
.cb-facet-a { animation-name: cb-facet-a; animation-duration: 11s }
.cb-facet-b { animation-name: cb-facet-b; animation-duration: 15s }
.cb-mark { animation-name: cb-mark; animation-duration: 9s }
@media (prefers-reduced-motion: reduce) { .cb-facet-a, .cb-facet-b, .cb-mark { animation: none } }
`;

/** A stable negative delay (0 to -16s) from a string, so neighbouring blocks don't drift in lockstep. */
function driftDelay(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `-${(Math.abs(h) % 16000) / 1000}s`;
}

/**
 * A block of the event colour with flat decoration so it isn't an empty slab: two angled facets
 * (a lighter and a darker tint, like the FBLC logo) and the icon repeated large and faint in the corner.
 * The decoration drifts slowly (off under prefers-reduced-motion); children never move.
 * `seed` staggers the drift phase per instance (defaults to the colour).
 */
export function ColorBlock({
  color,
  icon: Icon,
  className,
  style,
  children,
  watermark = true,
  seed,
}: {
  color: string;
  icon: LucideIcon;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  watermark?: boolean;
  seed?: string;
}) {
  const vars = { '--cb-delay': driftDelay(seed ?? color) } as CSSProperties;
  // Each facet SVG is oversized (inset -10%, i.e. 120% of the block) so its edges never show while it
  // drifts. Points are remapped (v = (b + 10) / 1.2) so the resting shapes match the original layout.
  return (
    <div className={'relative overflow-hidden ' + (className ?? '')} style={{ ...style, ...vars, background: color }}>
      <style href="kcb-color-block" precedence="default">{COLOR_BLOCK_CSS}</style>
      <svg className="cb-facet-a pointer-events-none absolute -inset-[10%] h-[120%] w-[120%]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points="0,0 42,0 18,100 0,100" fill="#fff" fillOpacity={0.07} />
      </svg>
      <svg className="cb-facet-b pointer-events-none absolute -inset-[10%] h-[120%] w-[120%]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points="70.17,0 100,0 100,100 48.17,100" fill="#000" fillOpacity={0.1} />
      </svg>
      {watermark && (
        <Icon
          className="cb-mark pointer-events-none absolute -right-[6%] top-1/2 aspect-square h-[135%] w-auto -translate-y-1/2 -rotate-12 opacity-[0.1]"
          style={{ color: '#fff' }}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** ColorBlock for an event slug. */
export function EventBlock({ slug, ...rest }: Omit<Parameters<typeof ColorBlock>[0], 'color' | 'icon'> & { slug: string }) {
  const { icon, color } = eventStyle(slug);
  return <ColorBlock color={color} icon={icon} seed={slug} {...rest} />;
}
