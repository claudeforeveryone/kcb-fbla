// One colour and one outline icon per event, shared by Vocab, Play and anywhere an event needs an identity.
// Colours are all dark enough for white text (WCAG AA at the sizes we use).
import type { LucideIcon } from 'lucide-react';
import {
  BrainCircuit,
  Briefcase,
  Calculator,
  CandlestickChart,
  ConciergeBell,
  Globe,
  Lightbulb,
  Megaphone,
  PiggyBank,
  Rocket,
  Scale,
  Stethoscope,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';

export type EventStyle = { color: string; icon: LucideIcon };

export const EVENT_STYLE: Record<string, EventStyle> = {
  accounting: { color: '#1E7A4C', icon: Calculator },
  'business-law': { color: '#4B3F8F', icon: Scale },
  economics: { color: '#B45309', icon: TrendingUp },
  'data-science-ai': { color: '#0E7490', icon: BrainCircuit },
  'healthcare-administration': { color: '#0F766E', icon: Stethoscope },
  'intro-business-concepts': { color: '#3F6FB3', icon: Lightbulb },
  'organizational-leadership': { color: '#BE185D', icon: Users },
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

/** The event's outline icon inside a thin white ring, for use on the event's colour (like a team crest). */
export function EventCrest({ slug, size = 72, className }: { slug: string; size?: number; className?: string }) {
  const { icon: Icon } = eventStyle(slug);
  return (
    <span
      className={'grid shrink-0 place-items-center rounded-full border-2 border-white/90 text-white ' + (className ?? '')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.75} />
    </span>
  );
}
