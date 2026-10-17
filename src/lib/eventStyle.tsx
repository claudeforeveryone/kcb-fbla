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

/**
 * A flat block of the event colour with its icon repeated large and faint in the corner. Nothing moves on its own: in
 * a card (a `group`), the faint icon eases over a few degrees while the card is hovered.
 */
export function ColorBlock({
  color,
  icon: Icon,
  className,
  style,
  children,
  watermark = true,
}: {
  color: string;
  icon: LucideIcon;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  watermark?: boolean;
}) {
  return (
    <div className={'relative overflow-hidden ' + (className ?? '')} style={{ ...style, background: color }}>
      {watermark && (
        <Icon
          className="pointer-events-none absolute -right-[6%] top-1/2 aspect-square h-[135%] w-auto -translate-y-1/2 -rotate-12 opacity-[0.1] transition-[rotate,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[3%] group-hover:-rotate-6 motion-reduce:transition-none"
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
  return <ColorBlock color={color} icon={icon} {...rest} />;
}
