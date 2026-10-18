// Building blocks shared by the Me pages: data hook, activity heatmap, mini leaderboard, friends.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, UserMinus, UserPlus, UserX, X } from 'lucide-react';
import { Avatar, Button, Dropdown, EloBadge, Tooltip, cn, errorMessage, useToast } from '../../components/ui';
import { type ProfileStats } from '../../lib/types';
import {
  acceptFriend,
  addFriend,
  getFriendship,
  removeFriend,
  formatDate,
  type Friendship,
  type MiniBoard,
} from '../../api/me';

// ------------------------------------------------------------------------------------------------ data hook

export type Async<T> = { data: T | undefined; error: unknown; loading: boolean; reload: () => void; set: (v: T) => void };

/** Runs `fn` when deps change; ignores stale results. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => id === seq.current && setState({ data, error: null, loading: false }),
      (error) => id === seq.current && setState({ data: undefined, error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((v: T) => setState({ data: v, error: null, loading: false }), []);
  return { ...state, reload, set };
}

// ------------------------------------------------------------------------------------------------ dates

/** YYYY-MM-DD in America/Toronto (the server's streak day). */
export function torontoDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------------------------------------ heatmap

const LEVELS = [
  'bg-surface-3',
  'bg-blue/30',
  'bg-blue/55',
  'bg-blue',
  'bg-navy dark:bg-[#a9c4ee]',
];

/** GitHub-style grid of answers per day for the last `weeks` weeks (columns are weeks, Sunday on top). */
export function ActivityHeatmap({ activity, weeks = 12 }: { activity: ProfileStats['activity']; weeks?: number }) {
  const { columns, total, activeDays, best } = useMemo(() => {
    const map = new Map(activity.map((a) => [a.date, a.answered]));
    const today = torontoDay();
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const start = addDays(today, -dow - (weeks - 1) * 7);
    const cols: { date: string; n: number; future: boolean }[][] = [];
    let total = 0;
    let activeDays = 0;
    let best = 0;
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const future = date > today;
        const n = future ? 0 : (map.get(date) ?? 0);
        if (n) {
          total += n;
          activeDays++;
          best = Math.max(best, n);
        }
        col.push({ date, n, future });
      }
      cols.push(col);
    }
    return { columns: cols, total, activeDays, best };
  }, [activity, weeks]);

  const level = (n: number) => (n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4);
  const monthLabel = (col: { date: string }[], i: number) => {
    const first = col[0].date;
    const prev = i > 0 ? columns[i - 1][0].date : null;
    if (prev && prev.slice(5, 7) === first.slice(5, 7)) return '';
    return new Date(`${first}T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
  };

  const thisWeek = columns[columns.length - 1].reduce((sum, c) => sum + c.n, 0);
  const facts: [string, string][] = [
    ['Answers', total.toLocaleString()],
    ['Active days', String(activeDays)],
    ['This week', String(thisWeek)],
    ['Best day', String(best)],
  ];
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <div className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `26px repeat(${weeks}, clamp(13px, 4.2vw, 20px))` }}>
            <span />
            {columns.map((col, i) => (
              <span key={`m${i}`} className="h-4 overflow-visible whitespace-nowrap text-[10px] font-semibold text-muted">
                {monthLabel(col, i)}
              </span>
            ))}
            {Array.from({ length: 7 }, (_, d) => (
              <Row key={d} d={d} columns={columns} level={level} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted">
          Less
          {LEVELS.map((c, i) => (
            <span key={i} className={cn('size-3 rounded-none', c)} aria-hidden />
          ))}
          More
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-5 md:pl-4">
        {facts.map(([label, value]) => (
          <div key={label} className="border-t border-line pt-3">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="tabular mt-0.5 font-display text-xl font-extrabold text-heading">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Row({
  d,
  columns,
  level,
}: {
  d: number;
  columns: { date: string; n: number; future: boolean }[][];
  level: (n: number) => number;
}) {
  return (
    <>
      <span className="self-center pr-1 text-right text-[10px] leading-none text-muted">{d === 1 ? 'Mon' : d === 3 ? 'Wed' : d === 5 ? 'Fri' : ''}</span>
      {columns.map((col) => {
        const c = col[d];
        const label = `${formatDate(c.date, true)}: ${c.n} answer${c.n === 1 ? '' : 's'}`;
        return (
          <span
            key={c.date}
            title={c.future ? undefined : label}
            aria-label={c.future ? undefined : label}
            className={cn(
              'aspect-square rounded-none transition-transform duration-150 hover:scale-125',
              c.future ? 'bg-transparent' : LEVELS[level(c.n)],
            )}
          />
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ mini leaderboard

export function MiniLeaderboard({ board, userId }: { board: MiniBoard; userId: string }) {
  const aroundIds = new Set(board.around.map((r) => r.user_id));
  const top = board.top.filter((r) => !aroundIds.has(r.user_id));
  const gap = top.length > 0 && board.around.length > 0 && board.around[0].rank > top[top.length - 1].rank + 1;
  const Row = ({ r }: { r: MiniBoard['around'][number] }) => {
    const me = r.user_id === userId;
    return (
      <li>
        <Link
          to={`/u/${r.username}`}
          className={cn(
            'flex items-center gap-3 rounded-none px-2.5 py-2 transition-colors hover:bg-surface-2',
            me && 'bg-red/[0.06] shadow-[inset_3px_0_0_var(--red)] hover:bg-red/[0.09]',
          )}
        >
          <span
            className={cn(
              'tabular w-7 shrink-0 text-center font-display text-sm font-extrabold',
              r.rank <= 3 ? 'text-heading' : 'text-muted',
            )}
          >
            {r.rank}
          </span>
          <Avatar src={r.avatar_url} name={r.display_name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-sm font-semibold', me ? 'text-red dark:text-danger' : 'text-heading')}>
              {r.is_me ? 'You' : r.display_name}
            </span>
            <span className="block truncate text-xs text-muted">@{r.username}</span>
          </span>
          <EloBadge elo={r.elo} size="sm" />
        </Link>
      </li>
    );
  };
  return (
    <div>
      <ol className="space-y-0.5">
        {top.map((r) => (
          <Row key={r.user_id} r={r} />
        ))}
      </ol>
      {gap && (
        <div className="my-1 flex items-center gap-2 px-3 text-muted" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-line-strong" />
          <span className="text-xs">...</span>
          <span className="h-px flex-1 border-t border-dashed border-line-strong" />
        </div>
      )}
      <ol className="space-y-0.5">
        {board.around.map((r) => (
          <Row key={r.user_id} r={r} />
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ friend button

export function FriendButton({ userId, name, onDark }: { userId: string; name: string; onDark?: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<Friendship | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getFriendship(userId).then(
      (f) => live && setState(f),
      () => live && setState({ state: 'none' }),
    );
    return () => {
      live = false;
    };
  }, [userId]);

  const run = async (fn: () => Promise<Friendship | void>, done: string) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next ?? { state: 'none' });
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const variant = onDark ? 'inverse' : 'outline';
  if (!state) return <Button variant={variant} loading disabled>Friends</Button>;

  if (state.state === 'none')
    return (
      <Button variant={variant} loading={busy} leftIcon={<UserPlus className="size-4" />} onClick={() => run(() => addFriend(userId), `Friend request sent to ${name}`)}>
        Add friend
      </Button>
    );
  if (state.state === 'incoming')
    return (
      <div className="flex gap-2">
        <Button variant={variant} loading={busy} leftIcon={<UserCheck className="size-4" />} onClick={() => run(() => acceptFriend(userId), `You and ${name} are now friends`)}>
          Accept request
        </Button>
        <Tooltip content="Decline">
          <Button
            variant={onDark ? 'inverse' : 'ghost'}
            size="icon"
            aria-label="Decline friend request"
            disabled={busy}
            onClick={() => run(() => removeFriend(userId), 'Request declined')}
          >
            <X className="size-4" />
          </Button>
        </Tooltip>
      </div>
    );
  if (state.state === 'outgoing')
    return (
      <Button variant={variant} loading={busy} leftIcon={<UserX className="size-4" />} onClick={() => run(() => removeFriend(userId), 'Request cancelled')}>
        Cancel request
      </Button>
    );
  return (
    <Dropdown
      trigger={({ open: _open, ...p }) => (
        <Button {...p} variant={variant} loading={busy} leftIcon={<UserCheck className="size-4" />}>
          Friends
        </Button>
      )}
      items={[
        { type: 'label', label: `Friends since ${formatDate(state.since, true)}` },
        {
          label: 'Remove friend',
          icon: <UserMinus className="size-4" />,
          danger: true,
          onSelect: () => run(() => removeFriend(userId), `Removed ${name} from friends`),
        },
      ]}
    />
  );
}

/**
 * Per-event and per-section breakdowns count the official question bank only; chapter custom tests are in the
 * headline totals but not broken down. Says so (with the gap) so the two sets of numbers don't look contradictory.
 */
export function officialOnlyNote(stats: Pick<ProfileStats, "questions_answered" | "by_event">): string {
  const broken = stats.by_event.reduce((n, e) => n + e.answered, 0);
  const other = Math.max(0, stats.questions_answered - broken);
  if (!other) return "Official question bank";
  return `Official question bank only. ${other.toLocaleString()} ${other === 1 ? "answer" : "answers"} from chapter tests ${other === 1 ? "counts" : "count"} in the totals but not here.`;
}

/** A small titled panel used down the profile sidebar. */
export function Panel({
  title,
  action,
  children,
  className,
  icon,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={cn('rounded-none border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold [&>svg]:size-4 [&>svg]:text-muted">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
