import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import { Badge, Modal, ProgressRing, cn } from '../../components/ui';
import type { AreaSummary, HistoryAttempt } from '../../api/play';
import { msUntilNextDay } from '../../api/play';
import { fmtDuration } from '../../components/exam';
import { ATTEMPT_KIND_LABELS, EVENTS, EVENT_GROUPS, eventName, type EventInfo } from '../../lib/types';
import { runHref } from './runLogic';

export const pctText = (x: number) => `${Math.round(x * 100)}%`;
export const accTone = (x: number): 'success' | 'blue' | 'warning' | 'red' =>
  x >= 0.8 ? 'success' : x >= 0.6 ? 'blue' : x >= 0.4 ? 'warning' : 'red';

export function AccuracyRing({ accuracy, answered, size = 52 }: { accuracy: number; answered: number; size?: number }) {
  if (!answered)
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[2px] border border-dashed border-line-strong text-[10px] font-bold uppercase tracking-wide text-muted"
        style={{ width: size, height: size }}
        aria-label="Not started"
      >
        New
      </span>
    );
  return (
    <ProgressRing value={accuracy * 100} size={size} stroke={size > 60 ? 7 : 5} tone={accTone(accuracy)} label={`${pctText(accuracy)} accuracy`}>
      <span className="text-[0.8rem]">{pctText(accuracy)}</span>
    </ProgressRing>
  );
}

export function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Live "resets in 5h 12m" text. */
export function useUntilReset(): string {
  const [ms, setMs] = useState(() => msUntilNextDay());
  useEffect(() => {
    const id = window.setInterval(() => setMs(msUntilNextDay()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function EventTitle({ e, className }: { e: EventInfo; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span>{e.name}</span>
      {e.isNew && (
        <Badge tone="red" solid className="h-5 px-2 text-[10px] uppercase tracking-wider">
          *New
        </Badge>
      )}
    </span>
  );
}

/** Choose an event (grouped like the competition guide). */
export function EventPickerModal({
  open,
  onClose,
  title,
  description,
  onPick,
  grade,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  onPick: (slug: string) => void;
  grade?: number | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="lg">
      <div className="space-y-5">
        {EVENT_GROUPS.map((g) => (
          <div key={g.id}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">{g.label}</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {EVENTS.filter((e) => e.group === g.id).map((e) => {
                const ineligible = e.slug === 'intro-business-concepts' && grade != null && grade > 10;
                return (
                  <button
                    key={e.slug}
                    type="button"
                    onClick={() => onPick(e.slug)}
                    className="flex items-center gap-3 rounded-[4px] border border-line px-3 py-2.5 text-left transition-colors hover:border-blue/60 hover:bg-surface-2"
                  >
                    <span className="grid h-8 w-12 shrink-0 place-items-center rounded-[2px] bg-navy/8 font-display text-[11px] font-bold text-navy dark:bg-blue/20 dark:text-link">
                      {e.short}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-heading">
                        <EventTitle e={e} />
                      </span>
                      {e.gradeNote && (
                        <span className={cn('block text-xs', ineligible ? 'text-warning' : 'text-muted')}>{e.gradeNote}</span>
                      )}
                    </span>
                    <ChevronRight className="size-4 text-muted" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Choose a competency area of one event to drill. */
export function AreaPickerModal({
  open,
  onClose,
  event,
  subs,
  areas,
}: {
  open: boolean;
  onClose: () => void;
  event: string | null;
  subs: { name: string; count: number }[];
  areas: Map<string, AreaSummary>;
}) {
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Area drill"
      description={event ? `${eventName(event)}: pick a competency area for 10 focused questions.` : undefined}
      size="lg"
    >
      <ul className="grid gap-1.5">
        {subs.map((s) => {
          const a = areas.get(s.name);
          return (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(runHref({ mode: 'area', event, area: s.name, n: 10 }));
                }}
                className="flex w-full items-center gap-3 rounded-[4px] border border-line px-3 py-2.5 text-left transition-colors hover:border-blue/60 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-heading">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {s.count} questions in the bank
                    {a ? ` / ${a.correct} of ${a.answered} right` : ' / not tried yet'}
                  </span>
                </span>
                {a && (
                  <Badge tone={accTone(a.accuracy)} className="tabular">
                    {pctText(a.accuracy)}
                  </Badge>
                )}
                <ChevronRight className="size-4 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Full or half mock for one event. */
export function MockPickerModal({ open, onClose, event }: { open: boolean; onClose: () => void; event: string | null }) {
  const navigate = useNavigate();
  const opts = [
    { n: 100, title: 'Full mock', sub: '100 questions / 50 minutes', note: 'Exactly like competition day.' },
    { n: 50, title: 'Half mock', sub: '50 questions / 25 minutes', note: 'Same pacing, half the time.' },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mock exam"
      description={event ? `${eventName(event)}. No feedback until you submit; areas weighted like the real test.` : undefined}
      size="md"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button
            key={o.n}
            type="button"
            onClick={() => {
              onClose();
              navigate(runHref({ mode: 'mock', event, n: o.n === 100 ? null : o.n }));
            }}
            className="rounded-[2px] border border-line border-t-[3px] border-t-navy p-4 text-left transition-colors hover:bg-surface-2 dark:border-t-link"
          >
            <div className="font-display font-bold text-heading">{o.title}</div>
            <div className="tabular text-sm font-semibold text-ink">{o.sub}</div>
            <div className="mt-1 text-xs text-muted">{o.note}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Compact list of past attempts linking to their review. */
export function AttemptList({ attempts, showEvent }: { attempts: HistoryAttempt[]; showEvent?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[4px] border border-line bg-surface">
      {attempts.map((t) => {
        const p = t.total ? t.correct / t.total : 0;
        const d = t.elo_after - t.elo_before;
        return (
          <li key={t.id}>
            <Link
              to={`/play/review/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70"
            >
              <span
                className={cn(
                  'tabular grid size-11 shrink-0 place-items-center rounded-[2px] font-display text-sm font-extrabold',
                  p >= 0.8 ? 'bg-success/12 text-success' : p >= 0.6 ? 'bg-blue/12 text-blue dark:text-link' : 'bg-red/10 text-red dark:text-danger',
                )}
              >
                {pctText(p)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-heading">
                  {t.label || ATTEMPT_KIND_LABELS[t.kind]}
                  {showEvent && t.event && <span className="font-normal text-muted"> / {eventName(t.event)}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="tabular">
                    {t.correct}/{t.total} right
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {fmtDuration(t.duration_ms)}
                  </span>
                  <span>{relTime(t.created_at)}</span>
                </span>
              </span>
              {d !== 0 && (
                <span className={cn('tabular text-sm font-bold', d > 0 ? 'text-success' : 'text-red dark:text-danger')}>
                  {d > 0 ? '+' : ''}
                  {d}
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
