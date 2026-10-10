import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flame, History, Inbox, Plus, Swords, Trophy, Users, Zap } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Tabs,
  useToast,
} from '../../components/ui';
import { Page, Section } from '../../components/layout/Page';
import { Donut } from '../../components/charts';
import { useAuth, useProfile } from '../../lib/auth';
import type { ProfileCard } from '../../lib/types';
import {
  cancelDuel,
  duelBucket,
  duelRecord,
  duelSide,
  getPlayerCardByUsername,
  listFriendLinks,
  listMyDuels,
  respondDuel,
  subscribeArena,
  sweepDuels,
  type ArenaEvent,
  type DuelClock,
  type DuelRow,
  type FriendLink,
} from '../../api/arena';
import { ChallengeModal } from './ChallengeModal';
import { FriendsPanel } from './FriendsPanel';
import { DuelCard, PlayerLine, displayName, useNow, usePlayers } from './parts';

type Tab = 'duels' | 'history' | 'friends';
type HistoryFilter = 'all' | 'win' | 'loss' | 'draw';
type ModalState = { open: boolean; opponent: ProfileCard | null; event: ArenaEvent | null; clock?: DuelClock };

const PAGE = 15;

export function ArenaPage() {
  const { refreshProfile } = useAuth();
  const me = useProfile();
  const uid = me.id;
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'history' || tabParam === 'friends' ? tabParam : 'duels';
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (t === 'duels') n.delete('tab');
        else n.set('tab', t);
        return n;
      },
      { replace: true },
    );

  const [duels, setDuels] = useState<DuelRow[] | null>(null);
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ open: false, opponent: null, event: null });
  const [histFilter, setHistFilter] = useState<HistoryFilter>('all');
  const [histShown, setHistShown] = useState(PAGE);
  const { players, ensure, put } = usePlayers();
  const now = useNow(30_000);

  const loadLinks = useCallback(async () => {
    try {
      const l = await listFriendLinks(uid);
      setLinks(l);
      void ensure(l.map((x) => x.other));
    } catch {
      /* the friends tab shows what it has; duels are the critical path */
    }
  }, [uid, ensure]);

  const load = useCallback(async () => {
    setError(null);
    try {
      await sweepDuels();
      const [d] = await Promise.all([listMyDuels(uid), loadLinks()]);
      setDuels(d);
      void ensure(d.map((x) => duelSide(x, uid).opponentId));
    } catch (e) {
      setError(e);
    }
  }, [uid, ensure, loadLinks]);

  useEffect(() => {
    void load();
  }, [load]);

  // refresh when the tab comes back into view (expiries, results that landed while away)
  useEffect(() => {
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 30_000) {
        last = Date.now();
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  // realtime
  const playersRef = useRef(players);
  playersRef.current = players;
  const duelsRef = useRef(duels);
  duelsRef.current = duels;
  useEffect(() => {
    return subscribeArena(uid, {
      onDuel: (row, kind) => {
        const oppId = duelSide(row, uid).opponentId;
        void ensure([oppId]);
        const before = duelsRef.current?.find((d) => d.id === row.id) ?? null;
        if (kind !== 'DELETE') {
          // toasts for things that happened to me
          const name = displayName(playersRef.current[oppId]);
          if (!before && row.status === 'pending' && row.opponent_id === uid) {
            toast.toast({
              title: `${name === 'Player' ? 'Someone' : name} challenged you`,
              description: 'Accept within 24 hours.',
              tone: 'info',
            });
            setFresh((f) => new Set(f).add(row.id));
          } else if (before && before.status === 'pending' && row.challenger_id === uid) {
            if (row.status === 'accepted')
              toast.toast({
                title: `${name} accepted your challenge`,
                tone: 'success',
                action: { label: 'Play now', onClick: () => navigate(`/arena/${row.id}`) },
              });
            else if (row.status === 'declined') toast.info(`${name} declined your challenge`);
          } else if (before && before.status !== 'complete' && row.status === 'complete') {
            void refreshProfile();
            setFresh((f) => new Set(f).add(row.id));
          }
        }
        setDuels((prev) => {
          if (!prev) return prev;
          if (kind === 'DELETE') return prev.filter((d) => d.id !== row.id);
          const i = prev.findIndex((d) => d.id === row.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { ...prev[i], ...row };
            return next;
          }
          return [row, ...prev];
        });
      },
      onFriends: () => void loadLinks(),
    });
  }, [uid, ensure, loadLinks, toast, navigate, refreshProfile]);

  // ?challenge=<username> (from profiles) opens the challenge modal
  const challengeParam = params.get('challenge');
  useEffect(() => {
    if (!challengeParam) return;
    let alive = true;
    (async () => {
      try {
        const p = await getPlayerCardByUsername(challengeParam);
        if (!alive) return;
        if (!p) toast.error(`No player called @${challengeParam.replace(/^@/, '')}`);
        else if (p.id === uid) toast.info("That's you. Pick someone else to duel.");
        else {
          put(p);
          setModal({ open: true, opponent: p, event: null });
        }
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : 'Could not find that player.');
      } finally {
        if (alive)
          setParams(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.delete('challenge');
              return n;
            },
            { replace: true },
          );
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeParam]);

  // ---------------------------------------------------------------------------------------------- derived
  const buckets = useMemo(() => {
    const b = { incoming: [] as DuelRow[], yourMove: [] as DuelRow[], waiting: [] as DuelRow[], done: [] as DuelRow[] };
    for (const d of duels ?? []) {
      const k = duelBucket(d, uid);
      if (k === 'incoming') b.incoming.push(d);
      else if (k === 'your-move') b.yourMove.push(d);
      else if (k === 'outgoing' || k === 'their-move') b.waiting.push(d);
      else b.done.push(d);
    }
    b.yourMove.sort((a, c) => new Date(a.expires_at).getTime() - new Date(c.expires_at).getTime());
    b.done.sort(
      (a, c) => new Date(c.completed_at ?? c.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime(),
    );
    return b;
  }, [duels, uid]);

  const record = useMemo(() => duelRecord(buckets.done, uid), [buckets.done, uid]);
  const wins = me.duel_wins;
  const losses = me.duel_losses;
  const draws = me.duel_draws;
  const played = wins + losses + draws;
  const winRate = played ? Math.round((wins / played) * 100) : null;

  const friendCards = useMemo(
    () => links.filter((l) => l.status === 'accepted').map((l) => players[l.other]).filter((p): p is ProfileCard => !!p),
    [links, players],
  );
  const rivals = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of buckets.done) {
      if (d.status !== 'complete') continue;
      const o = duelSide(d, uid).opponentId;
      m.set(o, (m.get(o) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => ({ id, rec: duelRecord(buckets.done, uid, id) }));
  }, [buckets.done, uid]);
  const recentCards = useMemo(() => {
    const seen = new Set<string>();
    const out: ProfileCard[] = [];
    for (const d of duels ?? []) {
      const id = duelSide(d, uid).opponentId;
      if (seen.has(id) || !players[id]) continue;
      seen.add(id);
      out.push(players[id]);
    }
    return out.slice(0, 6);
  }, [duels, players, uid]);

  const incomingFriendCount = links.filter((l) => l.status === 'pending' && l.direction === 'in').length;

  // ---------------------------------------------------------------------------------------------- actions
  const patch = (row: DuelRow) => setDuels((prev) => prev?.map((d) => (d.id === row.id ? { ...d, ...row } : d)) ?? prev);
  const actions = {
    onAccept: async (d: DuelRow) => {
      try {
        const row = await respondDuel(d.id, true);
        patch(row);
        navigate(`/arena/${d.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not accept.');
        void load();
      }
    },
    onDecline: async (d: DuelRow) => {
      try {
        patch(await respondDuel(d.id, false));
        toast.info('Challenge declined');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not decline.');
        void load();
      }
    },
    onCancel: async (d: DuelRow) => {
      try {
        patch(await cancelDuel(d.id));
        toast.info('Challenge cancelled');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not cancel.');
        void load();
      }
    },
    onRematch: (d: DuelRow) => {
      const opp = players[duelSide(d, uid).opponentId] ?? null;
      setModal({ open: true, opponent: opp, event: d.event as ArenaEvent, clock: d.time_limit_sec as DuelClock });
    },
  };

  const openNew = (opponent: ProfileCard | null = null) => setModal({ open: true, opponent, event: null });

  const histRows = buckets.done.filter((d) => {
    if (histFilter === 'all') return true;
    if (d.status !== 'complete') return false;
    const o = !d.winner_id ? 'draw' : d.winner_id === uid ? 'win' : 'loss';
    return o === histFilter;
  });

  // ---------------------------------------------------------------------------------------------- render
  const liveCount = buckets.incoming.length + buckets.yourMove.length;

  return (
    <>
      <PageHeader
        eyebrow="1v1 Arena"
        title="Arena"
        subtitle="Challenge anyone to the same 10 questions. Most correct wins, the faster time breaks a tie."
        actions={
          <Button variant="accent" size="lg" leftIcon={<Swords className="size-5" />} onClick={() => openNew()}>
            New challenge
          </Button>
        }
      >
        <dl className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: 'Wins', v: wins, icon: <Trophy className="size-4" /> },
            { k: 'Losses', v: losses, icon: null },
            { k: 'Draws', v: draws, icon: null },
            {
              k: record.streakKind === 'win' && record.streak >= 2 ? 'Win streak' : 'Win rate',
              v: record.streakKind === 'win' && record.streak >= 2 ? record.streak : winRate == null ? '-' : `${winRate}%`,
              icon: record.streakKind === 'win' && record.streak >= 2 ? <Flame className="size-4 text-red" /> : null,
            },
          ].map((s) => (
            <div key={s.k} className="rounded-[12px] bg-white/[0.07] px-4 py-3 ring-1 ring-inset ring-white/12 backdrop-blur-sm">
              <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">
                {s.icon}
                {s.k}
              </dt>
              <dd className="tabular mt-0.5 font-display text-2xl font-extrabold text-white">{s.v}</dd>
            </div>
          ))}
        </dl>
      </PageHeader>

      <Page>
        <Tabs<Tab>
          aria-label="Arena sections"
          id="arena-tabs"
          value={tab}
          onChange={setTab}
          className="mb-6"
          items={[
            { value: 'duels', label: 'Live duels', icon: <Zap className="size-4" />, count: liveCount || undefined },
            { value: 'history', label: 'History', icon: <History className="size-4" /> },
            { value: 'friends', label: 'Friends', icon: <Users className="size-4" />, count: incomingFriendCount || undefined },
          ]}
        />

        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : duels == null ? (
          <LobbySkeleton />
        ) : tab === 'friends' ? (
          <FriendsPanel
            uid={uid}
            links={links}
            players={players}
            duels={buckets.done}
            onChallenge={(p) => openNew(p)}
            onChanged={() => void loadLinks()}
          />
        ) : tab === 'history' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SegmentedControl<HistoryFilter>
                  size="sm"
                  aria-label="Filter history"
                  value={histFilter}
                  onChange={(v) => {
                    setHistFilter(v);
                    setHistShown(PAGE);
                  }}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'win', label: 'Wins' },
                    { value: 'loss', label: 'Losses' },
                    { value: 'draw', label: 'Draws' },
                  ]}
                />
                <span className="tabular text-sm text-muted">{histRows.length} duels</span>
              </div>
              {histRows.length === 0 ? (
                <EmptyState
                  icon={<History />}
                  title={histFilter === 'all' ? 'No finished duels yet' : 'Nothing here yet'}
                  description={
                    histFilter === 'all'
                      ? 'Results land here when both players have played. Send your first challenge.'
                      : 'Try another filter, or go make some history.'
                  }
                  action={
                    <Button variant="accent" leftIcon={<Swords className="size-4" />} onClick={() => openNew()}>
                      New challenge
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="space-y-3">
                    {histRows.slice(0, histShown).map((d) => (
                      <DuelCard key={d.id} duel={d} uid={uid} players={players} actions={actions} now={now} fresh={fresh.has(d.id)} />
                    ))}
                  </div>
                  {histRows.length > histShown && (
                    <div className="mt-4 flex justify-center">
                      <Button variant="outline" onClick={() => setHistShown((n) => n + PAGE)}>
                        Show more
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
            <aside className="space-y-6">
              <RecordCard wins={wins} losses={losses} draws={draws} />
              <RivalsCard rivals={rivals} players={players} onChallenge={openNew} />
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {liveCount === 0 && buckets.waiting.length === 0 ? (
                <EmptyState
                  icon={<Swords />}
                  title="No live duels"
                  description="Pick a rival, choose an event and send a challenge. You'll both get the same 10 questions."
                  action={
                    <>
                      <Button variant="accent" leftIcon={<Plus className="size-4" />} onClick={() => openNew()}>
                        New challenge
                      </Button>
                      <Button variant="outline" leftIcon={<Users className="size-4" />} onClick={() => setTab('friends')}>
                        Find friends
                      </Button>
                    </>
                  }
                />
              ) : (
                <>
                  {buckets.incoming.length > 0 && (
                    <Section
                      title={
                        <span className="flex items-center gap-2">
                          <span className="relative flex size-2.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red opacity-60 motion-reduce:hidden" />
                            <span className="relative inline-flex size-2.5 rounded-full bg-red" />
                          </span>
                          Incoming challenges
                        </span>
                      }
                      description="Accept to unlock the questions. Challenges expire after 24 hours."
                    >
                      <div className="space-y-3">
                        {buckets.incoming.map((d) => (
                          <DuelCard key={d.id} duel={d} uid={uid} players={players} actions={actions} now={now} fresh={fresh.has(d.id)} />
                        ))}
                      </div>
                    </Section>
                  )}
                  {buckets.yourMove.length > 0 && (
                    <Section title="Your move" description="Your clock starts when you press Start, not before.">
                      <div className="space-y-3">
                        {buckets.yourMove.map((d) => (
                          <DuelCard key={d.id} duel={d} uid={uid} players={players} actions={actions} now={now} fresh={fresh.has(d.id)} />
                        ))}
                      </div>
                    </Section>
                  )}
                  {buckets.waiting.length > 0 && (
                    <Section title="Waiting on them" description="We'll notify you the moment they answer or finish.">
                      <div className="space-y-3">
                        {buckets.waiting.map((d) => (
                          <DuelCard key={d.id} duel={d} uid={uid} players={players} actions={actions} now={now} fresh={fresh.has(d.id)} />
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}

              {buckets.done.length > 0 && (
                <Section
                  title="Recent results"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => setTab('history')}>
                      See all
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {buckets.done.slice(0, 3).map((d) => (
                      <DuelCard key={d.id} duel={d} uid={uid} players={players} actions={actions} now={now} fresh={fresh.has(d.id)} />
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <aside className="space-y-6">
              <RecordCard wins={wins} losses={losses} draws={draws} />
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Users className="size-4 text-blue dark:text-link" /> Friends
                  </h3>
                  <Button size="xs" variant="ghost" onClick={() => setTab('friends')}>
                    {incomingFriendCount > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <Inbox className="size-3.5" /> {incomingFriendCount} new
                      </span>
                    ) : (
                      'Manage'
                    )}
                  </Button>
                </div>
                {friendCards.length === 0 ? (
                  <p className="text-sm text-muted">
                    No friends yet.{' '}
                    <button type="button" className="font-semibold text-link hover:underline" onClick={() => setTab('friends')}>
                      Add some
                    </button>{' '}
                    to challenge them in one tap.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {friendCards.slice(0, 6).map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <PlayerLine player={p} size="sm" className="flex-1" />
                        <Button size="icon-sm" variant="secondary" aria-label={`Challenge ${displayName(p)}`} onClick={() => openNew(p)}>
                          <Swords className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <RivalsCard rivals={rivals} players={players} onChallenge={openNew} />
            </aside>
          </div>
        )}
      </Page>

      <ChallengeModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        uid={uid}
        opponent={modal.opponent}
        event={modal.event}
        clock={modal.clock}
        defaultEvent={me.main_event}
        friends={friendCards}
        recent={recentCards}
        onSent={(_id, opp) => {
          put(opp);
          if (tab !== 'duels') setTab('duels');
          void load();
        }}
      />
    </>
  );
}

export default ArenaPage;

function RecordCard({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const played = wins + losses + draws;
  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
        <Trophy className="size-4 text-warning" /> Your record
      </h3>
      {played === 0 ? (
        <p className="text-sm text-muted">Your wins, losses and draws show up here after your first finished duel.</p>
      ) : (
        <Donut
          title="Duel record"
          size={128}
          thickness={14}
          segments={[
            { label: 'Wins', value: wins, color: 'var(--success)' },
            { label: 'Losses', value: losses, color: 'var(--red)' },
            { label: 'Draws', value: draws, color: 'var(--muted)' },
          ]}
          formatValue={(v) => String(v)}
          center={
            <div className="text-center">
              <div className="tabular font-display text-2xl font-extrabold text-heading">{Math.round((wins / played) * 100)}%</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">win rate</div>
            </div>
          }
        />
      )}
    </Card>
  );
}

function RivalsCard({
  rivals,
  players,
  onChallenge,
}: {
  rivals: { id: string; rec: ReturnType<typeof duelRecord> }[];
  players: Record<string, ProfileCard>;
  onChallenge: (p: ProfileCard) => void;
}) {
  if (rivals.length === 0) return null;
  return (
    <Card>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Swords className="size-4 text-red" /> Top rivals
      </h3>
      <ul className="space-y-3">
        {rivals.map(({ id, rec }) => {
          const p = players[id];
          const lead = rec.wins - rec.losses;
          return (
            <li key={id} className="flex items-center gap-2">
              <PlayerLine
                player={p}
                size="sm"
                className="flex-1"
                sub={
                  <span className="tabular">
                    {rec.wins}-{rec.losses}
                    {rec.draws ? `-${rec.draws}` : ''}
                  </span>
                }
              />
              <Badge tone={lead > 0 ? 'success' : lead < 0 ? 'red' : 'neutral'}>
                {lead > 0 ? `+${lead}` : lead < 0 ? lead : 'Even'}
              </Badge>
              {p && (
                <Button size="icon-sm" variant="ghost" aria-label={`Challenge ${displayName(p)}`} onClick={() => onChallenge(p)}>
                  <Swords className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LobbySkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" role="status" aria-label="Loading the Arena">
      <div className="space-y-3">
        <Skeleton className="mb-2 h-6 w-48" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-4">
            <Skeleton className="size-10" rounded="rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-20" rounded="rounded-[10px]" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" rounded="rounded-[12px]" />
        <Skeleton className="h-40 w-full" rounded="rounded-[12px]" />
      </div>
    </div>
  );
}
