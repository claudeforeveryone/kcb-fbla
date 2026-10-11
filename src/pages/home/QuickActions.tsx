import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton, cn, formatUntil } from '../../components/ui';
import { eventInfo } from '../../lib/types';
import { eventStyle } from '../../lib/eventStyle';
import { nextTorontoMidnight, runLink, type DailyStatus } from './homeData';

/** The three big "do something now" tiles under the hero. */
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
    <div className="relative z-10 -mt-16 grid gap-3 sm:grid-cols-3 md:-mt-20 md:gap-4">
      {/* Continue */}
      <ActionTile
        to={ev ? runLink({ kind: 'practice', event: ev.slug }) : '/play'}
        tone="navy"
        color={ev ? eventStyle(ev.slug).color : undefined}
        eyebrow={ev ? (continueReason === 'last' ? 'Continue' : 'Your main event') : 'Get started'}
        title={ev ? ev.name : 'Pick your first event'}
        body={ev ? 'A fresh practice set, weighted to questions you haven’t mastered.' : '15 events, 1,500 official-style questions.'}
        cta={ev ? 'Resume practice' : 'Browse events'}
      />

      {/* Daily challenge */}
      {dailyLoading && !daily ? (
        <div className="rounded-[4px] border border-line bg-surface p-5 shadow-card">
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
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-red opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-red" />
              </span>
              Daily challenge
            </span>
          }
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

// White cards (like the stat boxes on fblc.ca); the tone only colours the top bar, the eyebrow and the link.
const TONES = {
  navy: '#001E60',
  red: '#BF0D3E',
  blue: '#3F6FB3',
  done: '#1E8E5A',
} as const;

function ActionTile({
  to,
  tone,
  color,
  eyebrow,
  title,
  body,
  cta,
}: {
  to: string;
  tone: keyof typeof TONES;
  /** Overrides the tone colour, e.g. with the event's own colour. */
  color?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  body: ReactNode;
  cta: string;
}) {
  const c = color ?? TONES[tone];
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-[4px] border border-line border-t-4 bg-surface p-5 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong focus-visible:-translate-y-0.5 sm:p-6"
      style={{ borderTopColor: c }}
    >
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em]" style={{ color: c }}>
        {eyebrow}
      </span>
      <h2 className="mt-2 truncate font-display text-xl font-extrabold tracking-tight text-heading sm:mt-3 md:text-2xl">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold sm:mt-5" style={{ color: c }}>
        {cta}
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

