import { cn } from '../ui/cn';
import { categoryOf, type Notification, type NotificationCategory } from '../../api/notifications';

/** Thin colour bar per category (no icon tiles). */
const BARS: Record<NotificationCategory, string> = {
  arena: 'bg-red',
  classroom: 'bg-blue',
  chapter: 'bg-navy dark:bg-white/70',
  achievements: 'bg-warning',
  social: 'bg-success',
  other: 'bg-line-strong',
};

const TEXT: Record<NotificationCategory, string> = {
  arena: 'text-red dark:text-[#ff8aa8]',
  classroom: 'text-blue dark:text-link',
  chapter: 'text-navy dark:text-white/80',
  achievements: 'text-[#8a5f00] dark:text-warning',
  social: 'text-success',
  other: 'text-muted',
};

const LABELS: Record<NotificationCategory, string> = {
  arena: 'Arena',
  classroom: 'Classroom',
  chapter: 'Chapter',
  achievements: 'Achievement',
  social: 'Friends',
  other: 'Notice',
};

/** A thin coloured left bar marking the notification's category. Stretch it inside a flex row. */
export function NotificationIcon({ n, size: _size }: { n: Notification; size?: 'sm' | 'md' }) {
  return <span className={cn('w-[3px] shrink-0 self-stretch', BARS[categoryOf(n.kind)])} aria-hidden />;
}

/** Small flat uppercase kind label, e.g. ARENA. */
export function NotificationKindLabel({ n, className }: { n: Notification; className?: string }) {
  const cat = categoryOf(n.kind);
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-[0.08em]', TEXT[cat], className)}>{LABELS[cat]}</span>
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
