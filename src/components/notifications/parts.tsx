import type { ComponentType } from 'react';
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  Handshake,
  Layers,
  Megaphone,
  Mountain,
  Newspaper,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
  Zap,
  type LucideProps,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { categoryOf, type Notification, type NotificationCategory } from '../../api/notifications';

type Icon = ComponentType<LucideProps>;

/** Achievement icons by the lucide name stored on fbla_achievement_defs.icon. */
const ACHIEVEMENT_ICONS: Record<string, Icon> = {
  BadgeCheck, BookOpen, CalendarCheck, Compass, Crown, Flame, Footprints, Gem, GraduationCap, Layers, Mountain,
  Sparkles, Star, Swords, Target, Timer, TrendingUp, Trophy, Users, Zap,
};

function iconFor(n: Notification): Icon {
  const k = n.kind;
  if (k === 'achievement') {
    const name = typeof n.data?.icon === 'string' ? n.data.icon : '';
    return ACHIEVEMENT_ICONS[name] ?? Award;
  }
  if (k === 'duel_result') return n.data?.outcome === 'win' ? Trophy : Swords;
  if (k === 'duel_declined') return XCircle;
  if (k === 'duel_expired') return Timer;
  if (k.startsWith('duel') || k.startsWith('arena')) return Swords;
  if (k === 'friend_request') return UserPlus;
  if (k.startsWith('friend')) return Handshake;
  if (k === 'announcement') return Megaphone;
  if (k === 'newsletter') return Newspaper;
  if (k.startsWith('assignment')) return ClipboardList;
  if (k === 'chapter_join' || k === 'chapter_added') return UserPlus;
  if (k === 'chapter_removed') return UserMinus;
  if (k === 'chapter_banned' || k.startsWith('ban')) return ShieldAlert;
  if (k === 'chapter_unbanned') return ShieldCheck;
  if (k === 'trainer_assigned') return GraduationCap;
  if (k.startsWith('role') || k === 'chapter_role') {
    const role = n.data?.role;
    return role === 'president' ? Crown : role === 'trainer' ? GraduationCap : ShieldCheck;
  }
  return Bell;
}

const TONES: Record<NotificationCategory, string> = {
  arena: 'bg-red/10 text-red dark:bg-red/20 dark:text-[#ff8aa8]',
  classroom: 'bg-blue/10 text-blue dark:bg-blue/20 dark:text-link',
  chapter: 'bg-navy/8 text-navy dark:bg-white/10 dark:text-white',
  achievements: 'bg-warning/15 text-[#8a5f00] dark:text-warning',
  social: 'bg-success/10 text-success',
  other: 'bg-surface-2 text-muted',
};

export function NotificationIcon({ n, size = 'md' }: { n: Notification; size?: 'sm' | 'md' }) {
  const Icon = iconFor(n);
  const cat = categoryOf(n.kind);
  const win = n.kind === 'duel_result' && n.data?.outcome === 'win';
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl',
        size === 'sm' ? 'size-9' : 'size-10',
        win ? 'bg-warning/15 text-[#8a5f00] dark:text-warning' : TONES[cat],
      )}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'size-[18px]' : 'size-5'} strokeWidth={2.1} />
    </span>
  );
}

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'narrow' }) : null;

/** "now", "5m", "3h", "Yesterday", "Tue", "Oct 3", "Oct 3, 2025". */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  const d = new Date(t);
  const today = startOfDay(new Date(now));
  const days = Math.round((today - startOfDay(d)) / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Full timestamp for title tooltips. */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Group label for the full list: Today, Yesterday, weekday this week, or a date. */
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Spoken description (relative time) for screen readers. */
export function spokenAgo(iso: string): string {
  if (!rtf) return fullTime(iso);
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

/** Internal links are app paths ("/arena/123"); anything else opens in a new tab. */
export function isInternalLink(link: string | null | undefined): link is string {
  return !!link && link.startsWith('/') && !link.startsWith('//');
}
