// One colour and one icon per event, shared by Vocab, Play and anywhere an event needs an identity.
// Colours are all dark enough for white text (WCAG AA at the sizes we use).
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
 * The event's mark: its icon in white on a small square of its colour. The one place an event's colour shows at
 * full strength; cards and headers around it stay white. White is literal so dark mode can't flip it.
 */
export function Mark({
  icon: Icon,
  color,
  size = 40,
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={'grid shrink-0 place-items-center ' + (className ?? '')}
      style={{ width: size, height: size, background: color, color: '#fff', borderRadius: Math.round(size * 0.2) }}
      aria-hidden
    >
      <Icon style={{ width: '50%', height: '50%' }} strokeWidth={2} />
    </span>
  );
}

/** Mark for an event slug. */
export function EventMark({ slug, size = 40, className }: { slug: string; size?: number; className?: string }) {
  const { icon, color } = eventStyle(slug);
  return <Mark icon={icon} color={color} size={size} className={className} />;
}
