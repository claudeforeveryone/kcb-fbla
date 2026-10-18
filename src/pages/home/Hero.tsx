import type { ReactNode } from 'react';
import { Avatar, Skeleton, cn } from '../../components/ui';
import { Sparkline } from '../../components/charts';
import type { ProfileStats } from '../../lib/types';
import { torontoDay } from './homeData';

type HeroProfile = {
  display_name: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  peak_elo: number;
  questions_answered: number;
  current_streak: number;
  best_streak: number;
  last_active_date: string | null;
};

export function Hero({ profile, stats, statsLoading }: { profile: HeroProfile; stats: ProfileStats | undefined; statsLoading: boolean }) {
  const today = torontoDay();
  const practisedToday = profile.last_active_date === today;
  // The server reports 0 once a streak has lapsed; the cached profile may still hold yesterday's count.
  const streak = stats ? stats.current_streak : profile.current_streak;
  const answeredToday = stats?.activity.find((d) => d.date === today)?.answered ?? 0;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  // The headline is today's state, said plainly: what you did, or the one thing worth doing next.
  let title: string;
  let line: string;
  if (profile.questions_answered === 0) {
    title = 'Start with ten questions';
    line = 'Your first set places you on the ladder.';
  } else if (practisedToday && answeredToday > 0) {
    title = `${answeredToday} question${answeredToday === 1 ? '' : 's'} today`;
    line = streak > 1 ? `Streak safe. Day ${streak}.` : 'Practise tomorrow to start a streak.';
  } else if (streak > 0) {
    title = `Keep your ${streak}-day streak`;
    line = 'It ends at midnight. One Quick 10 keeps it.';
  } else {
    title = 'Start a streak today';
    line = 'One set a day keeps it going.';
  }

  return (
    <header className="band relative isolate text-white">
      <div className="relative mx-auto grid w-full max-w-[1440px] gap-8 px-4 pb-8 pt-8 sm:px-6 md:pb-10 md:pt-12 lg:grid-cols-[1fr_auto] lg:items-end lg:px-10">
        <div className="flex min-w-0 items-center gap-4 animate-rise motion-reduce:animate-none md:gap-5">
          <Avatar src={profile.avatar_url} name={profile.display_name} size="xl" className="max-sm:size-14 max-sm:text-lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/65">{dateLine}</p>
            <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-tight text-white sm:truncate md:text-4xl">{title}</h1>
            <p className="mt-1 text-[0.9375rem] text-white/75 md:text-base">{line}</p>
          </div>
        </div>

        <dl className="tabular grid grid-cols-3 border-t border-line pt-5 lg:border-t-0 lg:pt-0">
          <Rating elo={profile.elo} stats={stats} loading={statsLoading} />
          <Fig label="Peak" value={Math.round(Math.max(profile.peak_elo, profile.elo))} />
          <Fig
            label="Streak"
            value={
              <>
                {streak}
                <span className="ml-1 text-sm font-semibold text-muted">day{streak === 1 ? '' : 's'}</span>
              </>
            }
            note={practisedToday && streak > 0 ? 'Safe today' : streak > 0 ? 'Not safe yet' : `Best ${profile.best_streak}`}
            hot={practisedToday && streak > 0}
          />
        </dl>
      </div>
    </header>
  );
}

function Fig({ label, value, note, hot }: { label: string; value: ReactNode; note?: ReactNode; hot?: boolean }) {
  return (
    <div className="min-w-0 border-l border-line pl-4 first:border-l-0 first:pl-0 sm:pl-6 lg:min-w-[150px] lg:first:pl-6 lg:first:border-l">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold leading-none text-heading md:text-[1.75rem]">{value}</dd>
      {note && <dd className={cn('mt-1.5 text-xs font-semibold', hot ? 'text-red dark:text-danger' : 'text-muted')}>{note}</dd>}
    </div>
  );
}

function Rating({ elo, stats, loading }: { elo: number; stats: ProfileStats | undefined; loading: boolean }) {
  const history = stats?.elo_history ?? [];
  const recent = history.slice(-30).map((h) => h.elo);
  // Change over the last 7 days, against the last rating on or before a week ago (0 if you're new).
  const weekAgo = torontoDay(Date.now() - 7 * 86_400_000);
  const before = [...history].reverse().find((h) => h.date <= weekAgo)?.elo ?? (history.length ? 0 : elo);
  const delta = elo - before;
  return (
    <Fig
      label="Elo"
      value={Math.round(elo)}
      note={
        loading && !stats ? (
          <Skeleton className="h-3 w-16" />
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className={delta > 0 ? 'text-success' : delta < 0 ? 'text-red dark:text-danger' : undefined}>
              {delta > 0 ? '+' : ''}
              {delta} this week
            </span>
            {recent.length >= 2 && <Sparkline values={recent} width={44} height={14} area={false} title="Elo, last 30 days" />}
          </span>
        )
      }
    />
  );
}
