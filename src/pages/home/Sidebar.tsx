import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EloBadge,
  ErrorState,
  Skeleton,
  cn,
} from '../../components/ui';
import {
  ROLE_LABELS,
  type PlayerLeaderboardRow,
  type ProfileStats,
} from '../../lib/types';
import { torontoDay, type ChapterSummary } from './homeData';

// ------------------------------------------------------------------------------------------------ this week

export function WeekCard({
  stats,
  loading,
  profile,
}: {
  stats: ProfileStats | undefined;
  loading: boolean;
  profile: { questions_answered: number; questions_correct: number; best_answer_streak: number };
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const t = Date.now() - (6 - i) * 86_400_000;
    const date = torontoDay(t);
    return {
      date,
      label: new Date(t).toLocaleDateString(undefined, { weekday: 'narrow' }),
      answered: stats?.activity.find((a) => a.date === date)?.answered ?? 0,
    };
  });
  const max = Math.max(10, ...days.map((d) => d.answered));
  const week = days.reduce((s, d) => s + d.answered, 0);
  const activeDays = days.filter((d) => d.answered > 0).length;
  const acc = profile.questions_answered ? Math.round((profile.questions_correct / profile.questions_answered) * 100) : null;

  return (
    <Card>
      <CardHeader
        title="This week"
        subtitle={
          loading && !stats
            ? 'Loading...'
            : week === 0
              ? 'No questions yet this week'
              : `${week} question${week === 1 ? '' : 's'} on ${activeDays} day${activeDays === 1 ? '' : 's'}`
        }
      />
      <div className="flex h-24 items-end gap-2" role="img" aria-label={`Questions answered per day this week: ${days.map((d) => d.answered).join(', ')}`}>
        {days.map((d, i) => {
          const today = i === 6;
          const h = d.answered ? Math.max(10, (d.answered / max) * 100) : 4;
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.date}: ${d.answered}`}>
              {loading && !stats ? (
                <Skeleton className="w-full" rounded="rounded-md" />
              ) : (
                <div
                  className={cn(
                    'w-full rounded-[2px] transition-[height] duration-500 ease-out',
                    d.answered ? (today ? 'bg-red' : 'bg-blue/35') : 'bg-surface-3',
                  )}
                  style={{ height: `${h}%` }}
                />
              )}
              <span className={cn('text-[0.7rem] font-semibold', today ? 'text-red' : 'text-muted')}>{d.label}</span>
            </div>
          );
        })}
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
        <Mini label="Answered" value={profile.questions_answered.toLocaleString()} />
        <Mini label="Accuracy" value={acc == null ? '–' : `${acc}%`} />
        <Mini label="Best run" value={String(profile.best_answer_streak)} />
      </dl>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="tabular font-display text-lg font-extrabold text-heading">{value}</dd>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ leaderboard

export function MiniLeaderboard({
  rows,
  me,
  loading,
  error,
  onRetry,
}: {
  rows: PlayerLeaderboardRow[] | undefined;
  me: { rank: number | null; players: number | null; display_name: string; username: string; avatar_url: string | null; elo: number };
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const list = rows ?? [];
  const meInTop = list.some((r) => r.is_me);
  return (
    <Card>
      <CardHeader
        title="Leaderboard"
        subtitle={me.players ? `${me.players.toLocaleString()} ranked players` : 'Top players by Elo'}
        action={
          <Link to="/leaderboard" className="link text-sm">
            See all
          </Link>
        }
      />
      {error && !rows ? (
        <ErrorState title="Couldn't load the leaderboard" error={error} onRetry={onRetry} className="py-6" />
      ) : loading && !rows ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-5" />
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">No ranked players yet. Answer a set to be the first.</p>
      ) : (
        <ol className="-mx-2">
          {list.map((r) => (
            <Row
              key={r.user_id}
              rank={r.rank}
              name={r.display_name || r.username}
              username={r.username}
              avatar={r.avatar_url}
              elo={r.elo}
              isMe={r.is_me}
            />
          ))}
          {!meInTop && me.rank != null && (
            <>
              <li aria-hidden className="flex justify-center py-0.5 text-muted">
                <span className="tracking-[0.3em]">···</span>
              </li>
              <Row rank={me.rank} name={me.display_name} username={me.username} avatar={me.avatar_url} elo={me.elo} isMe />
            </>
          )}
        </ol>
      )}
    </Card>
  );
}

const PODIUM = ['bg-red text-white', 'border border-heading bg-surface text-heading', 'border border-heading bg-surface text-heading'];

function Row({ rank, name, username, avatar, elo, isMe }: { rank: number; name: string; username: string; avatar: string | null; elo: number; isMe: boolean }) {
  return (
    <li>
      <Link
        to={`/u/${username}`}
        className={cn(
          'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
          isMe ? 'bg-red/[0.07] ring-1 ring-inset ring-red/25 hover:bg-red/10' : 'hover:bg-surface-2',
        )}
      >
        <span
          className={cn(
            'tabular grid size-6 shrink-0 place-items-center rounded-[2px] text-xs font-extrabold',
            rank <= 3 ? PODIUM[rank - 1] : 'text-muted',
          )}
        >
          {rank}
        </span>
        <Avatar src={avatar} name={name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">
          {name}
          {isMe && <span className="ml-1.5 text-xs font-bold text-red dark:text-danger">You</span>}
        </span>
        <EloBadge elo={elo} size="sm" />
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ chapter

export function ChapterCard({
  summary,
  hasChapter,
  loading,
  error,
  onRetry,
}: {
  summary: ChapterSummary | null | undefined;
  hasChapter: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (!hasChapter) {
    return (
      <div className="rounded-[4px] border border-line bg-surface p-5">
        <h3 className="text-base font-bold text-heading">Practise with your chapter</h3>
        <p className="mt-1 text-sm text-muted">
          Join your school's chapter for assignments, chapter tests and a spot on the chapter leaderboard.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to="/chapter" variant="primary" size="sm">
            Join with a code
          </ButtonLink>
          <ButtonLink to="/chapter/new" variant="ghost" size="sm" leftIcon={<Plus className="size-4" />}>
            Start a chapter
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (error && !summary) return <ErrorState title="Couldn't load your chapter" error={error} onRetry={onRetry} />;
  if (loading && summary === undefined)
    return (
      <Card>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/3" />
        <Skeleton className="mt-5 h-8 w-full" />
      </Card>
    );
  if (!summary) return null;

  const { chapter, role, memberCount, rank, chapters, avgElo, faces } = summary;
  return (
    <Link to="/chapter" className="block rounded-[4px] focus-visible:outline-offset-4">
      <Card interactive>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[8px] border border-line-strong bg-surface font-display text-sm font-extrabold text-heading">
            {chapter.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join('')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted">My chapter</div>
            <h3 className="truncate text-base font-extrabold">{chapter.name}</h3>
            {chapter.school && <div className="truncate text-sm text-muted">{chapter.school}</div>}
          </div>
          {role && <Badge tone={role === 'president' || role === 'executive' ? 'red' : 'navy'}>{ROLE_LABELS[role]}</Badge>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
          <Mini label="Members" value={String(memberCount)} />
          <Mini label={chapters && rank ? `Rank of ${chapters}` : 'Rank'} value={rank ? `#${rank}` : '–'} />
          <Mini label="Avg Elo" value={avgElo != null ? String(avgElo) : '–'} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-2">
            {faces.map((f) => (
              <Avatar key={f.id} src={f.avatar_url} name={f.display_name} size="sm" ring />
            ))}
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-link">
            Open chapter
            <ChevronRight className="size-4" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

// ------------------------------------------------------------------------------------------------ vocab

export function VocabCard({ data, mainEvent }: { data: { due: number; mastered: number; started: number } | undefined; mainEvent: string | null }) {
  if (!data) return null;
  const to = data.started === 0 && mainEvent ? `/vocab/${mainEvent}` : '/vocab';
  return (
    <Link to={to} className="group block rounded-[4px]">
      <Card interactive className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-bold', data.due > 0 ? 'text-red dark:text-danger' : 'text-heading')}>
            {data.started === 0 ? 'Start your vocab deck' : data.due > 0 ? `${data.due} term${data.due === 1 ? '' : 's'} due for review` : 'Vocab is up to date'}
          </div>
          <div className="text-xs text-muted">
            {data.started === 0 ? '60 key terms per event, spaced repetition' : `${data.mastered} mastered of ${data.started} started`}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}
