import { useEffect, useMemo } from 'react';
import { useAuth, useProfile } from '../../lib/auth';
import { listAttempts, playerLeaderboard, profileStats, weakSpots } from '../../api/core';
import { supabase } from '../../lib/supabase';
import { Hero } from './Hero';
import { QuickActions } from './QuickActions';
import { Inbox } from './Inbox';
import { RecentAttempts, WeakSpots } from './Practice';
import { ChapterCard, MiniLeaderboard, NextGoals, VocabCard, WeekCard } from './Sidebar';
import { getAssignments, getChapterSummary, getDailyStatus, getOpenDuels, getVocabDue } from './homeData';
import { useAsync } from './useAsync';

export default function HomePage() {
  const cached = useProfile();
  const { refreshProfile } = useAuth();
  const uid = cached.id;

  const stats = useAsync(async () => (await profileStats()) ?? undefined, [uid]);
  // The server copy is fresher than the cached auth profile (e.g. right after finishing a run).
  const profile = stats.data?.profile ?? cached;
  const chapterId = stats.data ? (stats.data.chapter?.id ?? null) : cached.chapter_id;

  const daily = useAsync(() => getDailyStatus(uid), [uid]);
  const recent = useAsync(() => listAttempts({ limit: 5 }).then((r) => r.rows), [uid]);
  const weak = useAsync(() => weakSpots(), [uid]);
  const board = useAsync(() => playerLeaderboard({ limit: 5 }), [uid]);
  const vocab = useAsync(() => getVocabDue(uid), [uid]);
  const inbox = useAsync(
    async () => {
      const [duels, assignments] = await Promise.all([
        getOpenDuels(uid),
        chapterId ? getAssignments(uid, chapterId) : Promise.resolve([]),
      ]);
      return { duels, assignments };
    },
    [uid, chapterId],
  );
  const chapter = useAsync(() => getChapterSummary(uid, chapterId!), [uid, chapterId], !!chapterId);

  // Keep the auth profile (nav avatar menu Elo) in step with what Home shows.
  useEffect(() => {
    if (stats.data && stats.data.profile.elo !== cached.elo) void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.data]);

  // Live duel updates: a new challenge or a reply refreshes the to-do list.
  const reloadInbox = inbox.reload;
  useEffect(() => {
    const ch = supabase
      .channel(`home-duels-${uid}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_duels', filter: `opponent_id=eq.${uid}` }, reloadInbox)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fbla_duels', filter: `challenger_id=eq.${uid}` }, reloadInbox)
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [uid, reloadInbox]);

  // Coming back to the tab (e.g. after a run in another tab) refreshes the time-sensitive cards.
  const { reload: reloadDaily } = daily;
  const { reload: reloadStats } = stats;
  const { reload: reloadRecent } = recent;
  useEffect(() => {
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
      last = Date.now();
      reloadDaily();
      reloadStats();
      reloadRecent();
      reloadInbox();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDaily, reloadStats, reloadRecent, reloadInbox]);

  const lastEvent = recent.data?.find((a) => a.event && a.kind !== 'custom')?.event ?? null;
  const continueEvent = lastEvent ?? profile.main_event ?? null;
  const continueReason = lastEvent ? 'last' : profile.main_event ? 'main' : null;

  const me = useMemo(
    () => ({
      rank: stats.data && profile.questions_answered > 0 ? stats.data.rank : null,
      players: stats.data?.players ?? null,
      display_name: profile.display_name || profile.username,
      username: profile.username,
      avatar_url: profile.avatar_url,
      elo: profile.elo,
    }),
    [stats.data, profile],
  );

  return (
    <>
      <Hero profile={profile} stats={stats.data} statsLoading={stats.loading} />
      <div className="animate-rise mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <QuickActions
          continueEvent={continueEvent}
          continueReason={continueReason}
          daily={daily.data}
          dailyLoading={daily.loading}
        />

        <div className="mt-6 grid gap-4 md:mt-8 md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4 md:gap-5">
            <Inbox
              duels={inbox.data?.duels}
              assignments={inbox.data?.assignments}
              hasChapter={!!chapterId}
              loading={inbox.loading}
              error={inbox.error}
              onRetry={inbox.reload}
            />
            <WeakSpots
              spots={weak.data}
              loading={weak.loading}
              error={weak.error}
              onRetry={weak.reload}
              answered={profile.questions_answered}
            />
            <RecentAttempts rows={recent.data} loading={recent.loading} error={recent.error} onRetry={recent.reload} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4 md:gap-5" aria-label="Your progress">
            <WeekCard stats={stats.data} loading={stats.loading} profile={profile} />
            <MiniLeaderboard rows={board.data} me={me} loading={board.loading} error={board.error} onRetry={board.reload} />
            <ChapterCard
              summary={chapter.data}
              hasChapter={!!chapterId}
              loading={chapter.loading}
              error={chapter.error}
              onRetry={chapter.reload}
            />
            <VocabCard data={vocab.data} mainEvent={profile.main_event} />
            <NextGoals stats={stats.data} profile={profile} />
          </aside>
        </div>
      </div>
    </>
  );
}
