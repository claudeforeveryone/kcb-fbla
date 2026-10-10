import type { ReactNode } from 'react';
import { BookOpen, FileText, Layers, Link2, Megaphone, Newspaper, ScrollText, type LucideIcon } from 'lucide-react';
import { cn, type BadgeTone, type SelectOption } from '../../../components/ui';
import { EVENTS, EVENT_GROUPS, eventInfo, type AssignmentKind, type PostKind } from '../../../lib/types';
import type { ClassroomContext } from '../../../api/classroom';
import { canManage } from '../../../api/classroom';

export const POST_META: Record<PostKind, { label: string; plural: string; icon: LucideIcon; tone: BadgeTone; accent: string; blurb: string }> = {
  announcement: {
    label: 'Announcement',
    plural: 'Announcements',
    icon: Megaphone,
    tone: 'red',
    accent: 'bg-red text-white',
    blurb: 'News, reminders and meeting changes for the whole chapter.',
  },
  newsletter: {
    label: 'Newsletter',
    plural: 'Newsletters',
    icon: Newspaper,
    tone: 'navy',
    accent: 'bg-navy text-white dark:bg-blue',
    blurb: 'A weekly letter from the executive team. Members get it by email too.',
  },
  link: {
    label: 'Link',
    plural: 'Links',
    icon: Link2,
    tone: 'blue',
    accent: 'bg-blue text-white',
    blurb: 'Share a useful page: guidelines, a video, a sign-up form.',
  },
  resource: {
    label: 'Resource',
    plural: 'Resources',
    icon: BookOpen,
    tone: 'success',
    accent: 'bg-success text-white',
    blurb: 'Study notes, tips and materials members can come back to.',
  },
};

export const ASSIGNMENT_META: Record<AssignmentKind, { label: string; icon: LucideIcon; verb: string }> = {
  test: { label: 'Chapter test', icon: FileText, verb: 'Take test' },
  deck: { label: 'Flashcards', icon: Layers, verb: 'Study deck' },
  official: { label: 'Official questions', icon: ScrollText, verb: 'Start' },
};

/** Grouped event options; `only` limits to the events the caller may manage. */
export function eventOptions(ctx: ClassroomContext | null, opts: { allowNone?: string; manageableOnly?: boolean } = {}): SelectOption[] {
  const out: SelectOption[] = [];
  if (opts.allowNone != null) out.push({ value: '', label: opts.allowNone });
  for (const g of EVENT_GROUPS) {
    for (const e of EVENTS.filter((x) => x.group === g.id)) {
      if (opts.manageableOnly && ctx && !canManage(ctx, e.slug)) continue;
      out.push({ value: e.slug, label: `${e.name}${e.isNew ? ' (new)' : ''}` });
    }
  }
  return out;
}

export function EventTag({ event, className, onClick }: { event: string | null | undefined; className?: string; onClick?: () => void }) {
  const info = eventInfo(event);
  if (!info) return null;
  const cls = cn(
    'inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted',
    onClick && 'transition-colors hover:border-blue/50 hover:text-heading',
    className,
  );
  const inner = (
    <>
      <span className={cn('size-1.5 rounded-full', info.group === 'objective' ? 'bg-blue' : 'bg-red')} aria-hidden />
      <span title={info.name}>{info.short}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={`Filter by ${info.name}`}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (rtf) {
    if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (abs < 604800) return rtf.format(Math.round(s / 86400), 'day');
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: abs > 300 * 86400 ? 'numeric' : undefined });
}

export function formatDate(iso: string, withTime = false): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: withTime ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** "Due in 3 days", "Due tomorrow 5:00 PM", "2 days late". */
export function dueLabel(iso: string | null, now = Date.now()): { text: string; tone: 'muted' | 'warning' | 'danger' } {
  if (!iso) return { text: 'No due date', tone: 'muted' };
  const t = new Date(iso).getTime();
  const diff = t - now;
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff < 0) {
    const days = Math.floor(-diff / 86400000);
    return { text: days >= 1 ? `${days} day${days === 1 ? '' : 's'} overdue` : 'Overdue', tone: 'danger' };
  }
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date(t)) - startOf(new Date(now))) / 86400000);
  if (days === 0) return { text: `Due today, ${time}`, tone: 'warning' };
  if (days === 1) return { text: `Due tomorrow, ${time}`, tone: 'warning' };
  if (days < 7) return { text: `Due ${new Date(iso).toLocaleDateString(undefined, { weekday: 'long' })}, ${time}`, tone: 'muted' };
  return { text: `Due ${formatDate(iso, true)}`, tone: 'muted' };
}

/** <input type="datetime-local"> value for a Date, in local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A coloured square icon for a post or assignment kind. */
export function KindIcon({ icon: Icon, accent, size = 'md' }: { icon: LucideIcon; accent: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]',
        size === 'lg' ? 'size-12 [&>svg]:size-6' : size === 'sm' ? 'size-8 [&>svg]:size-4' : 'size-10 [&>svg]:size-5',
        accent,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        <span className="h-[3px] w-4 rounded-full bg-red" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
