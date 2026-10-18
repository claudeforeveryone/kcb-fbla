import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton, cn, formatUntil } from '../../components/ui';
import { eventInfo } from '../../lib/types';
import { nextTorontoMidnight, runLink, type DailyStatus } from './homeData';

/** The three "do something now" links under the hero: one strip, split by hairlines. */
export function QuickActions({
  continueEvent,
  continueReason,
  daily,
  dailyLoading,
}: {
  continueEvent: string | null;
  continueReason: 'last' | 'main' | null;
  daily: DailyStatus | undefined;
  dailyLoading: boolean;
}) {
  const reset = useResetCountdown();
  const ev = eventInfo(continueEvent);

  return (
    <div className="mt-6 grid overflow-hidden rounded-[4px] border border-line bg-surface sm:grid-cols-3 md:mt-8">
      {/* Continue */}
      <ActionTile
        to={ev ? runLink({ kind: 'practice', event: ev.slug }) : '/play'}
        tone="navy"
        eyebrow={ev ? (continueReason === 'last' ? 'Continue' : 'Your main event') : 'Get started'}
        title={ev ? ev.name : 'Pick your first event'}
        body={ev ? 'A fresh practice set, weighted to questions you haven’t mastered.' : '15 events, 1,500 official-style questions.'}
        cta={ev ? 'Resume practice' : 'Browse events'}
      />

      {/* Daily challenge */}
      {dailyLoading && !daily ? (
        <div className="border-t border-line p-5 sm:border-l sm:border-t-0 sm:p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-5 h-4 w-28" />
        </div>
      ) : daily?.done ? (
        <ActionTile
          to={`/play/review/${daily.attempt.id}`}
          tone="done"
          eyebrow="Daily challenge done"
          title={
            <span className="tabular">
              {daily.attempt.correct}/{daily.attempt.total}
              <EloShift before={daily.attempt.elo_before} after={daily.attempt.elo_after} />
            </span>
          }
          body={`A new challenge unlocks in ${reset}.`}
          cta="Review answers"
        />
      ) : (
        <ActionTile
          to={runLink({ kind: 'daily' })}
          tone="red"
          eyebrow="Daily challenge"
          title="Today’s 10"
          body={`Same questions for every member. Resets in ${reset}.`}
          cta="Take the challenge"
        />
      )}

      {/* Quick 10 */}
      <ActionTile
        to={runLink({ kind: 'practice', n: 10 })}
        tone="blue"
        eyebrow="Mixed events"
        title="Quick 10"
        body="Ten questions from across every event. About five minutes."
        cta="Start now"
      />
    </div>
  );
}

function EloShift({ before, after }: { before: number; after: number }) {
  const d = after - before;
  if (d === 0) return null;
  return (
    <span className={cn('ml-2 align-middle text-sm font-bold', d > 0 ? 'text-success' : 'text-muted')}>
      {d > 0 ? '+' : ''}
      {d} Elo
    </span>
  );
}

function useResetCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return formatUntil(nextTorontoMidnight(now), now);
}

// The tone is a short rule above the eyebrow, the only colour in the strip.
const TONES = {
  navy: 'var(--heading)',
  red: 'var(--red)',
  blue: 'var(--blue)',
  done: 'var(--success)',
} as const;

function ActionTile({
  to,
  tone,
  eyebrow,
  title,
  body,
  cta,
}: {
  to: string;
  tone: keyof typeof TONES;
  eyebrow: ReactNode;
  title: ReactNode;
  body: ReactNode;
  cta: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col border-t border-line p-5 transition-colors duration-150 first:border-t-0 hover:bg-surface-2 focus-visible:bg-surface-2 sm:border-l sm:border-t-0 sm:p-6 sm:first:border-l-0"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className="h-[3px] w-4 transition-[width] duration-200 ease-out group-hover:w-6" style={{ background: TONES[tone] }} aria-hidden />
        {eyebrow}
      </span>
      <h2 className="mt-3 truncate font-display text-xl font-extrabold tracking-tight md:text-2xl">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-link">
        {cta}
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
