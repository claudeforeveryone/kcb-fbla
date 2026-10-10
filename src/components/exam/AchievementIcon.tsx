import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  Layers,
  Mountain,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { achievementDef } from '../../lib/types';

const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  Layers,
  Mountain,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Zap,
};

/** The lucide icon for an achievement code (falls back to a medal). */
export function AchievementIcon({ code, className }: { code: string; className?: string }) {
  const Icon = ICONS[achievementDef(code)?.icon ?? ''] ?? Award;
  return <Icon className={className} aria-hidden />;
}
