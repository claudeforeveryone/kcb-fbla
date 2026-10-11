import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Layers, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '../../components/ui';
import { ColorBlock, Crest, eventStyle } from '../../lib/eventStyle';
import type { StudyDeck } from '../../api/vocab';
import { STATUS_LABEL, type DeckStats, type TermStatus } from './leitner';

const NAVY = '#001E60';
type DeckId = Pick<StudyDeck, 'event' | 'key'>;

/** The colour a deck wears: its event's colour, or navy for the review deck and event-less chapter decks. */
export function deckColor(deck: DeckId): string {
  return deck.event && deck.key !== 'review' ? eventStyle(deck.event).color : NAVY;
}

/** CSS variables for a deck's colour: --ev (solid), --ev-2 (hover), --ev-soft (light tint). */
export function deckVars(color: string): CSSProperties {
  return {
    '--ev': color,
    '--ev-2': `color-mix(in srgb, ${color} 82%, black)`,
    '--ev-soft': `color-mix(in srgb, ${color} 9%, var(--surface))`,
  } as CSSProperties;
}

/** The icon a deck wears: its event's icon, or a generic one for the review deck and chapter decks. */
export function deckIcon(deck: DeckId): LucideIcon {
  if (deck.key === 'review') return RotateCcw;
  return deck.event ? eventStyle(deck.event).icon : Layers;
}

/** The deck's icon in its colour on a white disc, for use on the deck's colour block. */
export function DeckCrest({ deck, size = 64, className }: { deck: DeckId; size?: number; className?: string }) {
  return <Crest icon={deckIcon(deck)} color={deckColor(deck)} size={size} className={className} />;
}

/** The deck's colour as a decorated block (angled facets + faint oversized icon). */
export function DeckBlock({
  deck,
  className,
  style,
  children,
  watermark,
}: {
  deck: DeckId;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  watermark?: boolean;
}) {
  return (
    <ColorBlock color={deckColor(deck)} icon={deckIcon(deck)} className={className} style={style} watermark={watermark}>
      {children}
    </ColorBlock>
  );
}

/** Slim progress bar in the deck's colour: solid for mastered, a light tint for studied but not yet mastered. */
export function EventBar({ stats, color, className }: { stats: DeckStats; color: string; className?: string }) {
  const pct = (n: number) => `${stats.total ? (n / stats.total) * 100 : 0}%`;
  const studied = stats.total - stats.fresh;
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden bg-surface-3', className)} aria-hidden>
      <span
        className="absolute inset-y-0 left-0 transition-[width] duration-500"
        style={{ width: pct(studied), background: `color-mix(in srgb, ${color} 32%, transparent)` }}
      />
      <span className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: pct(stats.mastered), background: color }} />
    </div>
  );
}

/** Two-arc ring: studied (blue) under mastered (green); centre shows the mastered count. */
export function DeckRing({
  stats,
  size = 64,
  stroke = 6,
  className,
  inverse,
}: {
  stats: DeckStats;
  size?: number;
  stroke?: number;
  className?: string;
  /** On a navy background. */
  inverse?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const studied = stats.total ? (stats.total - stats.fresh) / stats.total : 0;
  const mastered = stats.total ? stats.mastered / stats.total : 0;
  const done = stats.total > 0 && stats.mastered === stats.total;
  const arc = (frac: number) => ({
    strokeDasharray: c,
    strokeDashoffset: c - frac * c,
    transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)',
  });
  return (
    <div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${stats.mastered} of ${stats.total} mastered, ${stats.total - stats.fresh} studied`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={inverse ? 'rgb(255 255 255 / 0.16)' : 'var(--surface-3)'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={inverse ? 'rgb(127 163 221 / 0.75)' : 'color-mix(in srgb, var(--blue) 45%, transparent)'}
          strokeWidth={stroke}
          strokeLinecap="butt"
          style={arc(studied)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--success)"
          strokeWidth={stroke}
          strokeLinecap="butt"
          style={arc(mastered)}
          opacity={mastered > 0 ? 1 : 0}
        />
      </svg>
      <span
        className={cn(
          'tabular absolute inset-0 grid place-items-center text-center font-display leading-none',
          inverse ? 'text-white' : 'text-heading',
        )}
      >
        <span>
          <span className={cn('block font-bold', size >= 80 ? 'text-xl' : 'text-sm')}>
            {done ? '100%' : stats.mastered}
          </span>
          {size >= 64 && !done && (
            <span className={cn('block text-[10px] font-semibold', inverse ? 'text-white/60' : 'text-muted')}>
              of {stats.total}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/** Thin stacked bar: mastered / reviewing / learning / new. */
export function MixBar({ stats, className }: { stats: DeckStats; className?: string }) {
  const seg = (n: number) => `${stats.total ? (n / stats.total) * 100 : 0}%`;
  return (
    <div className={cn('flex h-1.5 w-full overflow-hidden rounded-none bg-surface-3', className)} aria-hidden>
      <span className="h-full bg-success transition-[width] duration-500" style={{ width: seg(stats.mastered) }} />
      <span className="h-full bg-blue transition-[width] duration-500" style={{ width: seg(stats.review) }} />
      <span className="h-full bg-warning/80 transition-[width] duration-500" style={{ width: seg(stats.learning) }} />
    </div>
  );
}

const STATUS_STYLE: Record<TermStatus, string> = {
  new: 'bg-surface-2 text-muted ring-line',
  learning: 'bg-warning/12 text-[#8a5f00] ring-warning/30 dark:text-warning',
  review: 'bg-blue/10 text-blue ring-blue/25 dark:text-link',
  mastered: 'bg-success/10 text-success ring-success/25',
};

export function StatusChip({ status, className }: { status: TermStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-[2px] px-2 text-[11px] font-semibold ring-1 ring-inset',
        STATUS_STYLE[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Wraps case-insensitive matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const at = lower.indexOf(ql, i);
    if (at < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark key={k++} className="rounded-[3px] bg-warning/25 px-0.5 text-inherit dark:bg-warning/30">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  return <>{parts}</>;
}

/** Global key handler, ignored while typing in a field or when a modal is open. */
export function useHotkeys(handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // let a focused button or link handle its own activation keys
      if (t && /^(BUTTON|A)$/.test(t.tagName) && t.getAttribute('role') !== 'tab' && (e.key === ' ' || e.key === 'Enter')) return;
      // Space/Enter on the already-active mode tab do nothing useful, so the study session takes them
      if (t?.getAttribute('role') === 'tab' && (e.key === ' ' || e.key === 'Enter')) e.preventDefault();
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}

/** Big centred result panel used at the end of every mode. */
export function SessionPanel({
  eyebrow,
  title,
  children,
  actions,
  tone = 'navy',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'navy' | 'success' | 'red';
}) {
  const bar = {
    navy: 'bg-[var(--ev,var(--navy))]',
    success: 'bg-success',
    red: 'bg-red',
  }[tone];
  return (
    <div className="animate-pop relative mx-auto flex max-w-xl flex-col items-center overflow-hidden rounded-[12px] border border-line bg-surface px-5 py-9 text-center sm:px-10">
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', bar)} aria-hidden />
      {eyebrow && <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</div>}
      <h2 className="text-2xl font-extrabold md:text-3xl">{title}</h2>
      {children && <div className="mt-3 w-full text-[0.9375rem] text-muted">{children}</div>}
      {actions && <div className="mt-6 flex w-full flex-col justify-center gap-2 sm:flex-row">{actions}</div>}
    </div>
  );
}

export function MiniStat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'success' | 'red' | 'blue' }) {
  return (
    <div className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-center">
      <div
        className={cn(
          'tabular font-display text-2xl font-extrabold leading-none',
          tone === 'success' ? 'text-success' : tone === 'red' ? 'text-red dark:text-danger' : tone === 'blue' ? 'text-link' : 'text-heading',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

export function formatMs(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Keyframes used by the vocab games (rendered once per vocab page; index.css belongs to Foundation). */
export function VocabStyles() {
  return (
    <style>{`
@keyframes vocab-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(2px)} }
@keyframes vocab-match-out { 0%{transform:scale(1);opacity:1} 35%{transform:scale(1.06);opacity:1} 100%{transform:scale(.6);opacity:0} }
@keyframes vocab-float-up { 0%{transform:translate(-50%,0);opacity:0} 15%{opacity:1} 100%{transform:translate(-50%,-36px);opacity:0} }
`}</style>
  );
}

