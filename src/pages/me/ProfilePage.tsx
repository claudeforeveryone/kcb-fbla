import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, History, Pencil, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EloBadge,
  EmptyState,
  ErrorState,
  HeaderFigures,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatTile,
  cn,
  errorMessage,
  useToast,
} from '../../components/ui';
import { AvatarUpload } from '../../components/ui/AvatarUpload';
import { BarChart, Donut, LineChart, RadarChart } from '../../components/charts';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { ATTEMPT_KIND_LABELS, ROLE_LABELS, eventInfo, eventName, type ProfileStats } from '../../lib/types';
import {
  acceptFriend,
  chapterRank,
  formatDate,
  formatHours,
  listFriends,
  loadProfilePage,
  miniLeaderboard,
  pct,
  relativeTime,
  removeFriend,
  type FriendEntry,
} from '../../api/me';
import { ActivityHeatmap, FriendButton, MiniLeaderboard, Panel, officialOnlyNote, useAsync } from './parts';

export default function ProfilePage() {
  const { username } = useParams();
  const { profile: me } = useAuth();
  const ownRoute = !username || username.toLowerCase() === me?.username;
  const q = useAsync(() => loadProfilePage(ownRoute ? null : username!), [ownRoute, username]);

  if (q.loading && !q.data) return <ProfileSkeleton />;
  if (q.error)
    return (
      <>
        <PageHeader title="Profile" size="sm" />
        <Page>
          <ErrorState error={q.error} onRetry={q.reload} />
        </Page>
      </>
    );
  if (!q.data)
    return (
      <>
        <PageHeader title="Player not found" size="sm" />
        <Page>
          <EmptyState
            title={`No player called @${username}`}
            description="They may have changed their username. Find them on the leaderboard instead."
            action={<ButtonLink to="/leaderboard">Open the leaderboard</ButtonLink>}
          />
        </Page>
      </>
    );
  return <Profile stats={q.data} isMe={q.data.profile.id === me?.id} />;
}

function Profile({ stats, isMe }: { stats: ProfileStats; isMe: boolean }) {
  const p = stats.profile;
  const { profile: me } = useAuth();
  const main = eventInfo(p.main_event);
  const chapRank = useAsync(
    () => (stats.chapter ? chapterRank(stats.chapter.id, p.id) : Promise.resolve(null)),
    [stats.chapter?.id, p.id],
  );
  const board = useAsync(() => miniLeaderboard(p.id, stats.rank), [p.id, stats.rank]);

  const subtitle = [p.school, p.grade ? `Grade ${p.grade}` : null].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow={isMe ? 'Your player card' : 'Player card'}
        leading={
          isMe ? (
            <AvatarUpload src={me?.avatar_url ?? null} name={p.display_name} size="2xl" ring className="max-sm:size-20 max-sm:text-2xl" />
          ) : (
            <Avatar src={p.avatar_url} name={p.display_name} size="2xl" ring className="max-sm:size-20 max-sm:text-2xl" />
          )
        }
        title={<span className="break-words">{p.display_name}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-white">@{p.username}</span>
            {subtitle && <span aria-hidden>·</span>}
            {subtitle && <span>{subtitle}</span>}
          </span>
        }
        actions={
          isMe ? (
            <>
              <ButtonLink to="/me/settings#profile" variant="inverse" leftIcon={<Pencil className="size-4" />}>
                Edit profile
              </ButtonLink>
              <ButtonLink
                to="/me/career"
                variant="ghost"
                className="text-white hover:bg-white/10"
                leftIcon={<History className="size-4" />}
              >
                Career
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink
                to={`/arena?challenge=${encodeURIComponent(p.username)}`}
                variant="accent"
               
              >
                Challenge to a duel
              </ButtonLink>
              <FriendButton userId={p.id} name={p.display_name} onDark />
            </>
          )
        }
      >
        <HeaderFigures
          items={[
            { label: 'Elo', value: Math.round(p.elo) },
            {
              label: 'Global',
              value: (
                <>
                  #{stats.rank}
                  <span className="text-sm font-semibold text-muted"> of {stats.players}</span>
                </>
              ),
            },
            ...(stats.chapter
              ? [
                  {
                    label: (
                      <span className="block max-w-40 truncate">
                        {stats.chapter.name}
                        {stats.chapter.role !== 'member' && <span className="text-red dark:text-danger"> · {ROLE_LABELS[stats.chapter.role]}</span>}
                      </span>
                    ),
                    value: (
                      <ChipLink to={isMe ? '/chapter' : null}>
                        {chapRank.data ? (
                          <>
                            #{chapRank.data.rank}
                            <span className="text-sm font-semibold text-muted"> of {chapRank.data.of}</span>
                          </>
                        ) : (
                          '...'
                        )}
                      </ChipLink>
                    ),
                  },
                ]
              : []),
            ...(main
              ? [
                  {
                    label: 'Main event',
                    value: (
                      <Link to={`/play/${main.slug}`} className="hover:text-link" title={main.name}>
                        {main.short}
                      </Link>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {p.bio && <p className="mt-5 max-w-2xl whitespace-pre-line text-[0.9375rem] text-white/85">{p.bio}</p>}
      </PageHeader>

      <Page width="wide">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <StatGrid stats={stats} isMe={isMe} />
            <EloCard stats={stats} />
            <AccuracyCard stats={stats} />
            <Panel title="Activity" action={<span className="text-xs text-muted">Last 12 weeks</span>}>
              <ActivityHeatmap activity={stats.activity} />
            </Panel>
            {stats.recent_attempts && <RecentCard stats={stats} isMe={isMe} />}
          </div>

          <aside className="min-w-0 space-y-6">
            <Panel
              title={isMe ? 'Around you' : `Around ${p.display_name.split(' ')[0]}`}
              action={
                <Link to="/leaderboard" className="text-sm font-semibold text-link hover:underline">
                  Full board
                </Link>
              }
            >
              {board.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : board.error ? (
                <ErrorState error={board.error} onRetry={board.reload} className="py-6" />
              ) : board.data && (board.data.around.length || board.data.top.length) ? (
                <MiniLeaderboard board={board.data} userId={p.id} />
              ) : (
                <p className="text-sm text-muted">No ranked players yet.</p>
              )}
            </Panel>
            <DuelCard stats={stats} isMe={isMe} />
            {stats.best_paper && <BestPaper stats={stats} isMe={isMe} />}
            {isMe && <FriendsCard />}
          </aside>
        </div>
      </Page>
    </>
  );
}

function ChipLink({ to, children }: { to: string | null; children: ReactNode }) {
  return to ? <Link to={to}>{children}</Link> : <span>{children}</span>;
}

function StatGrid({ stats, isMe }: { stats: ProfileStats; isMe: boolean }) {
  const p = stats.profile;
  const today = stats.current_streak > 0;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
      <StatTile tone="navy" label="Global rank" value={`#${stats.rank}`} sub={`of ${stats.players} players`} />
      <StatTile
        label="Questions"
        value={stats.questions_answered.toLocaleString()}
        sub={`${stats.questions_correct.toLocaleString()} correct`}
      />
      <StatTile
        label="Accuracy"
        value={stats.questions_answered ? pct(stats.accuracy) : '–'}
        sub={`${stats.attempts_count} exam${stats.attempts_count === 1 ? '' : 's'}`}
      />
      <StatTile label="Time spent" value={formatHours(stats.time_spent_ms)} sub="practising" />
      <StatTile
        label="Current streak"
        value={`${stats.current_streak}d`}
        sub={today ? ('days in a row') : isMe ? 'Practise today to start' : 'Not active lately'}
      />
      <StatTile label="Best streak" value={`${stats.best_streak}d`} sub="days in a row" />
      <StatTile label="Answer streak" value={stats.best_answer_streak} sub="best run of correct answers" />
      <StatTile label="Peak Elo" value={p.peak_elo} sub="highest rating" />
    </div>
  );
}

function EloCard({ stats }: { stats: ProfileStats }) {
  const p = stats.profile;
  const [range, setRange] = useState<'30' | '90' | '365'>('90');
  const series = useMemo(() => {
    let pts = stats.elo_history.map((d) => ({ x: d.date, y: d.elo }));
    const created = p.created_at.slice(0, 10);
    if (pts.length && created < pts[0].x) pts = [{ x: created, y: 0 }, ...pts];
    const cutoff = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    const inRange = pts.filter((d) => d.x >= cutoff);
    // carry the last rating before the window in, so the line starts where the player was
    const before = pts.filter((d) => d.x < cutoff).pop();
    return before ? [{ x: cutoff, y: before.y }, ...inRange] : inRange;
  }, [stats.elo_history, p.created_at, range]);
  const change = series.length > 1 ? series[series.length - 1].y - series[0].y : 0;

  return (
    <Panel
      title="Elo over time"
      action={
        <SegmentedControl
          size="sm"
          aria-label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30d' },
            { value: '90', label: '90d' },
            { value: '365', label: '1y' },
          ]}
        />
      }
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular font-display text-3xl font-extrabold text-heading">{p.elo}</span>
        {change !== 0 && (
          <span className={cn('tabular text-sm font-semibold', change > 0 ? 'text-success' : 'text-danger')}>
            {change > 0 ? '+' : ''}
            {change} in {range === '365' ? 'the past year' : `${range} days`}
          </span>
        )}
        <span className="text-sm text-muted">Peak {p.peak_elo}</span>
      </div>
      <LineChart
        title="Elo rating over time"
        series={[{ name: 'Elo', data: series, color: 'var(--blue)' }]}
        height={220}
        yMin={0}
        dots={series.length < 20}
        emptyLabel="Finish a practice set to start your rating line"
      />
    </Panel>
  );
}

function AccuracyCard({ stats }: { stats: ProfileStats }) {
  const [view, setView] = useState<'event' | 'area'>('event');
  const subEvents = useMemo(() => [...new Set((stats.by_sub ?? []).map((s) => s.event))], [stats.by_sub]);
  const [event, setEvent] = useState<string>(() =>
    stats.profile.main_event && subEvents.includes(stats.profile.main_event) ? stats.profile.main_event : (subEvents[0] ?? ''),
  );
  const subs = (stats.by_sub ?? []).filter((s) => s.event === event);

  if (!stats.by_event.length)
    return (
      <Panel title="Accuracy">
        <EmptyState
          compact
          title="No answers yet"
          description="Accuracy by event and section shows up after the first practice set."
          action={<ButtonLink to="/play">Start practising</ButtonLink>}
        />
      </Panel>
    );

  return (
    <Panel
      title="Accuracy"
      action={
        stats.by_sub ? (
          <SegmentedControl
            size="sm"
            aria-label="Accuracy view"
            value={view}
            onChange={setView}
            options={[
              { value: 'event', label: 'Events' },
              { value: 'area', label: 'Sections' },
            ]}
          />
        ) : undefined
      }
    >
      {view === 'event' || !stats.by_sub ? (
        <BarChart
          title="Accuracy per event"
          max={100}
          formatValue={(v) => `${Math.round(v)}%`}
          data={[...stats.by_event]
            .sort((a, b) => b.accuracy - a.accuracy)
            .map((e) => ({
              label: eventName(e.event),
              value: Number(e.accuracy) * 100,
              sub: `${e.correct}/${e.answered}`,
              highlight: e.event === stats.profile.main_event,
            }))}
        />
      ) : (
        <div>
          <Select
            label="Event"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            options={subEvents.map((s) => ({ value: s, label: eventName(s) }))}
            className="max-w-xs"
          />
          <div className="mt-4">
            {subs.length >= 3 ? (
              <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <RadarChart
                  className="mx-auto max-w-full"
                  title={`Accuracy per section in ${eventName(event)}`}
                  axes={subs.map((s) => s.sub)}
                  series={[{ name: 'Accuracy', values: subs.map((s) => Number(s.accuracy) * 100) }]}
                  size={220}
                />
                <SubList subs={subs} />
              </div>
            ) : (
              <SubList subs={subs} />
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{officialOnlyNote(stats)}</p>
    </Panel>
  );
}

function SubList({ subs }: { subs: NonNullable<ProfileStats['by_sub']> }) {
  return (
    <BarChart
      title="Accuracy per section"
      max={100}
      formatValue={(v) => `${Math.round(v)}%`}
      data={[...subs]
        .sort((a, b) => a.accuracy - b.accuracy)
        .map((s) => ({
          label: s.sub,
          value: Number(s.accuracy) * 100,
          sub: `${s.correct}/${s.answered}`,
          color: s.accuracy < 0.6 ? 'var(--red)' : s.accuracy < 0.8 ? 'var(--warning)' : 'var(--success)',
        }))}
    />
  );
}

function DuelCard({ stats, isMe }: { stats: ProfileStats; isMe: boolean }) {
  const p = stats.profile;
  const total = p.duel_wins + p.duel_losses + p.duel_draws;
  return (
    <Panel
      title="Duel record"
      action={
        <Link to="/arena" className="text-sm font-semibold text-link hover:underline">
          Arena
        </Link>
      }
    >
      {total === 0 ? (
        <div className="text-sm text-muted">
          <p>No duels yet.</p>
          {isMe ? (
            <ButtonLink to="/arena" size="sm" variant="secondary" className="mt-3">
              Find an opponent
            </ButtonLink>
          ) : (
            <ButtonLink
              to={`/arena?challenge=${encodeURIComponent(p.username)}`}
              size="sm"
              variant="secondary"
              className="mt-3"
             
            >
              Be the first to challenge
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-5">
          <Donut
            title="Duel results"
            size={112}
            thickness={14}
            legend={false}
            segments={[
              { label: 'Wins', value: p.duel_wins, color: 'var(--success)' },
              { label: 'Losses', value: p.duel_losses, color: 'var(--red)' },
              { label: 'Draws', value: p.duel_draws, color: 'var(--muted)' },
            ]}
            center={
              <span className="text-center leading-tight">
                <span className="tabular block font-display text-xl font-extrabold text-heading">
                  {Math.round((p.duel_wins / total) * 100)}%
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">win rate</span>
              </span>
            }
          />
          <dl className="grid flex-1 gap-2 text-sm">
            {(
              [
                ['Wins', p.duel_wins, 'bg-success'],
                ['Losses', p.duel_losses, 'bg-red'],
                ['Draws', p.duel_draws, 'bg-muted'],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2 text-muted">
                  <span className={cn('size-2.5 rounded-full', c)} />
                  {l}
                </dt>
                <dd className="tabular font-bold text-heading">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Panel>
  );
}

function BestPaper({ stats, isMe }: { stats: ProfileStats; isMe: boolean }) {
  const b = stats.best_paper!;
  const body = (
    <div className="flex items-center gap-4">
      <div className="grid size-16 shrink-0 place-items-center rounded-[4px] border border-line border-t-[3px] border-t-red bg-surface">
        <span className="tabular font-display text-lg font-extrabold text-red dark:text-danger">{Math.round(Number(b.accuracy) * 100)}%</span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-heading">{b.label || eventName(b.event)}</div>
        <div className="text-sm text-muted">
          <span className="tabular">
            {b.correct}/{b.total}
          </span>{' '}
          · {ATTEMPT_KIND_LABELS[b.kind]} · {formatDate(b.created_at, true)}
        </div>
      </div>
    </div>
  );
  return (
    <Panel title="Best paper">
      {isMe ? (
        <Link to={`/play/review/${b.attempt_id}`} className="-m-2 block rounded-lg p-2 transition-colors hover:bg-surface-2">
          {body}
        </Link>
      ) : (
        body
      )}
    </Panel>
  );
}

function RecentCard({ stats, isMe }: { stats: ProfileStats; isMe: boolean }) {
  const rows = stats.recent_attempts ?? [];
  return (
    <Panel
      title="Recent exams"
      action={
        isMe && rows.length > 0 ? (
          <Link to="/me/career" className="text-sm font-semibold text-link hover:underline">
            All exams
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No exams yet.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {rows.slice(0, 6).map((a) => {
            const acc = a.total ? a.correct / a.total : 0;
            const d = a.elo_after - a.elo_before;
            const inner = (
              <>
                <span
                  className={cn(
                    'tabular grid size-10 shrink-0 place-items-center rounded-lg text-xs font-extrabold',
                    acc >= 0.8 ? 'bg-success/12 text-success' : acc >= 0.6 ? 'bg-warning/15 text-[#8a5f00] dark:text-warning' : 'bg-red/10 text-red dark:text-danger',
                  )}
                >
                  {Math.round(acc * 100)}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-heading">{a.label || eventName(a.event)}</span>
                  <span className="block text-xs text-muted">
                    {ATTEMPT_KIND_LABELS[a.kind]} · {a.correct}/{a.total} · {relativeTime(a.created_at)}
                  </span>
                </span>
                {d !== 0 && (
                  <Badge tone={d > 0 ? 'success' : 'red'} className="tabular">
                    {d > 0 ? '+' : ''}
                    {d}
                  </Badge>
                )}
              </>
            );
            return (
              <li key={a.id}>
                {isMe ? (
                  <Link to={`/play/review/${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function FriendsCard() {
  const toast = useToast();
  const q = useAsync(listFriends, []);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (f: FriendEntry, accept: boolean) => {
    setBusy(f.profile.id);
    try {
      if (accept) await acceptFriend(f.profile.id);
      else await removeFriend(f.profile.id);
      toast.success(accept ? `You and ${f.profile.display_name} are now friends` : 'Request declined');
      q.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const list = q.data ?? [];
  const friends = list.filter((f) => f.status === 'accepted');
  const incoming = list.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = list.filter((f) => f.status === 'pending' && !f.incoming);

  return (
    <Panel
      title="Friends"
      action={friends.length > 0 ? <span className="tabular text-sm text-muted">{friends.length}</span> : undefined}
    >
      {q.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} className="py-6" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">
          No friends yet. Open someone's profile from the{' '}
          <Link to="/leaderboard" className="font-semibold text-link hover:underline">
            leaderboard
          </Link>{' '}
          and add them.
        </p>
      ) : (
        <div className="space-y-4">
          {incoming.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-red dark:text-danger">Requests</div>
              <ul className="space-y-1">
                {incoming.map((f) => (
                  <li key={f.profile.id} className="flex items-center gap-2.5 rounded-lg bg-red/[0.04] px-2 py-1.5">
                    <Link to={`/u/${f.profile.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar src={f.profile.avatar_url} name={f.profile.display_name} size="sm" />
                      <span className="truncate text-sm font-semibold text-heading">{f.profile.display_name}</span>
                    </Link>
                    <Button size="icon-sm" variant="secondary" aria-label={`Accept ${f.profile.display_name}`} disabled={busy === f.profile.id} onClick={() => act(f, true)}>
                      <Check className="size-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Decline ${f.profile.display_name}`} disabled={busy === f.profile.id} onClick={() => act(f, false)}>
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {friends.length > 0 && (
            <ul className="space-y-0.5">
              {friends.slice(0, 8).map((f) => (
                <li key={f.profile.id}>
                  <Link to={`/u/${f.profile.username}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2">
                    <Avatar src={f.profile.avatar_url} name={f.profile.display_name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-heading">{f.profile.display_name}</span>
                      <span className="block truncate text-xs text-muted">@{f.profile.username}</span>
                    </span>
                    <EloBadge elo={f.profile.elo} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {outgoing.length > 0 && (
            <p className="text-xs text-muted">
              {outgoing.length} request{outgoing.length === 1 ? '' : 's'} waiting on{' '}
              {outgoing
                .slice(0, 2)
                .map((f) => f.profile.display_name)
                .join(', ')}
              {outgoing.length > 2 ? ' and others' : ''}.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <header className="band relative overflow-hidden">
        <div className="mx-auto flex max-w-[1440px] lg:px-10 items-center gap-4 px-4 pb-14 pt-12 sm:px-6">
          <Skeleton className="size-24 opacity-30" rounded="rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-56 opacity-30" />
            <Skeleton className="h-4 w-40 opacity-30" />
          </div>
        </div>
      </header>
      <Page width="wide">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="status" aria-label="Loading profile">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" rounded="rounded-[4px]" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-72" rounded="rounded-[4px]" />
          <Skeleton className="h-72" rounded="rounded-[4px]" />
        </div>
      </Page>
    </>
  );
}
