import { TrendingDown, TrendingUp } from 'lucide-react';
import { Avatar, FacetArt, Skeleton, cn } from '../../components/ui';
import { Sparkline } from '../../components/charts';
import type { ProfileStats } from '../../lib/types';
import { greeting, torontoDay } from './homeData';

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
  const first = (profile.display_name || profile.username).trim().split(/\s+/)[0];
  const today = torontoDay();
  const practisedToday = profile.last_active_date === today;
  // The server reports 0 once a streak has lapsed; the cached profile may still hold yesterday's count.
  const streak = stats ? stats.current_streak : profile.current_streak;
  const answeredToday = stats?.activity.find((d) => d.date === today)?.answered ?? 0;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  let line: string;
  if (profile.questions_answered === 0) line = 'Your first set places you on the ladder. Ten questions is all it takes.';
  else if (practisedToday && answeredToday > 0)
    line = `${answeredToday} question${answeredToday === 1 ? '' : 's'} today. ${streak > 1 ? `Day ${streak} of your streak is in the bag.` : 'Keep the momentum going.'}`;
  else if (streak > 0) line = `Your ${streak}-day streak ends at midnight. One quick set keeps it alive.`;
  else line = 'A quick set today starts a new streak.';

  return (
    <header className="facets relative isolate overflow-hidden text-white">
      <FacetArt className="opacity-90 max-md:opacity-40" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-6 px-4 pb-24 pt-8 sm:px-6 md:pb-28 md:pt-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-4 md:gap-5">
          <Avatar src={profile.avatar_url} name={profile.display_name} size="xl" ring className="max-sm:size-16 max-sm:text-xl" />
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
              <span className="h-[3px] w-5 bg-red" aria-hidden />
              {dateLine}
            </div>
            <h1 className="text-[1.75rem] sm:truncate font-extrabold tracking-tight text-white md:text-4xl">
              {greeting()}, {first}
            </h1>
            <p className="mt-1.5 max-w-xl text-[0.9375rem] text-white/75 md:text-base">{line}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <RatingPanel elo={profile.elo} peak={profile.peak_elo} stats={stats} loading={statsLoading} />
          <StreakPanel streak={streak} best={profile.best_streak} lit={practisedToday && streak > 0} />
        </div>
      </div>
    </header>
  );
}

function RatingPanel({ elo, peak, stats, loading }: { elo: number; peak: number; stats: ProfileStats | undefined; loading: boolean }) {
  const history = stats?.elo_history ?? [];
  const recent = history.slice(-30).map((h) => h.elo);
  // Change over the last 7 days, against the last rating on or before a week ago (0 if you're new).
  const weekAgo = torontoDay(Date.now() - 7 * 86_400_000);
  const before = [...history].reverse().find((h) => h.date <= weekAgo)?.elo ?? (history.length ? 0 : elo);
  const delta = elo - before;
  const peakElo = Math.round(Math.max(peak, elo));

  return (
    <div className="min-w-0 flex-1 rounded-[4px] border border-white/15 bg-white/10 p-4 sm:min-w-[280px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white/65">Elo rating</div>
          <div className="tabular mt-1 font-display text-4xl font-extrabold leading-none tracking-tight">{Math.round(elo)}</div>
        </div>
        <div className="text-right">
          {loading && !stats ? (
            <Skeleton className="h-8 w-24 bg-white/10" />
          ) : recent.length >= 2 ? (
            <Sparkline values={recent} width={96} height={34} color="#7FA3DD" title="Elo, last 30 days" />
          ) : null}
        </div>
      </div>
      <dl className="tabular mt-4 grid grid-cols-2 border-t border-white/15 pt-3 text-xs">
        <div>
          <dt className="font-bold uppercase tracking-[0.12em] text-white/60">Peak</dt>
          <dd className="mt-0.5 text-base font-extrabold text-white">{peakElo}</dd>
        </div>
        <div className="border-l border-white/15 pl-3">
          <dt className="font-bold uppercase tracking-[0.12em] text-white/60">This week</dt>
          <dd
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 text-base font-extrabold',
              delta > 0 ? 'text-[#7ee2b0]' : delta < 0 ? 'text-[#ff9fb6]' : 'text-white',
            )}
          >
            {delta > 0 ? <TrendingUp className="size-3.5" aria-hidden /> : delta < 0 ? <TrendingDown className="size-3.5" aria-hidden /> : null}
            {delta > 0 ? '+' : ''}
            {delta}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StreakPanel({ streak, best, lit }: { streak: number; best: number; lit: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[4px] border p-4 sm:w-[150px] sm:flex-col sm:items-start',
        lit ? 'border-red bg-red' : 'border-white/15 bg-white/10',
      )}
      title={lit ? 'You practised today' : 'Practise today to keep your streak'}
    >
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white/70">Streak</div>
      <div className="text-right sm:text-left">
        <div className="tabular font-display text-3xl font-extrabold leading-none">
          {streak}
          <span className="ml-1 text-sm font-semibold text-white/70">day{streak === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-1 text-xs text-white/75">{lit ? 'Streak safe today' : streak > 0 ? 'Not safe yet' : `Best ${best}`}</div>
      </div>
    </div>
  );
}
