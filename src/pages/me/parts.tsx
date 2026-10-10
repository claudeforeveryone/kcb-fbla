// Building blocks shared by the Me pages: data hook, activity heatmap, achievements, mini leaderboard, friends.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Check,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  Layers,
  Lock,
  Mountain,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, Button, Dropdown, EloBadge, ProgressBar, Tooltip, cn, errorMessage, useToast } from '../../components/ui';
import { ACHIEVEMENTS, EVENTS, type AchievementCode, type AchievementDef, type ProfileStats } from '../../lib/types';
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
            <span key={i} className={cn('size-3 rounded-[3px]', c)} aria-hidden />
          ))}
          More
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-2.5 md:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-3.5 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
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
              'aspect-square rounded-[3px] transition-transform duration-150 hover:scale-125',
              c.future ? 'bg-transparent' : LEVELS[level(c.n)],
            )}
          />
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ achievements

const ICONS: Record<string, LucideIcon> = {
  Footprints,
  Target,
  Layers,
  Mountain,
  BadgeCheck,
  Flame,
  CalendarCheck,
  Crown,
  Zap,
  Sparkles,
  Star,
  TrendingUp,
  Gem,
  Swords,
  Trophy,
  Compass,
  GraduationCap,
  Timer,
  Users,
  BookOpen,
};

/** How hard each achievement is; the hardest earned ones are showcased. */
const PRESTIGE: Record<AchievementCode, number> = {
  first_steps: 1,
  chapter_joined: 2,
  streak_3: 3,
  questions_100: 3,
  duel_win_1: 4,
  answer_streak_10: 5,
  elo_300: 5,
  questions_500: 6,
  streak_7: 6,
  perfect_paper: 6,
  speed_run: 6,
  all_events: 7,
  elo_500: 7,
  vocab_100: 7,
  mock_90: 8,
  answer_streak_25: 8,
  questions_1000: 9,
  duel_win_10: 9,
  elo_700: 10,
  streak_30: 10,
};

function progressFor(code: AchievementCode, s: ProfileStats): { value: number; max: number } | null {
  const p = s.profile;
  switch (code) {
    case 'questions_100':
      return { value: s.questions_answered, max: 100 };
    case 'questions_500':
      return { value: s.questions_answered, max: 500 };
    case 'questions_1000':
      return { value: s.questions_answered, max: 1000 };
    case 'streak_3':
      return { value: s.best_streak, max: 3 };
    case 'streak_7':
      return { value: s.best_streak, max: 7 };
    case 'streak_30':
      return { value: s.best_streak, max: 30 };
    case 'answer_streak_10':
      return { value: s.best_answer_streak, max: 10 };
    case 'answer_streak_25':
      return { value: s.best_answer_streak, max: 25 };
    case 'elo_300':
      return { value: p.peak_elo, max: 300 };
    case 'elo_500':
      return { value: p.peak_elo, max: 500 };
    case 'elo_700':
      return { value: p.peak_elo, max: 700 };
    case 'duel_win_1':
      return { value: p.duel_wins, max: 1 };
    case 'duel_win_10':
      return { value: p.duel_wins, max: 10 };
    case 'all_events':
      return { value: s.by_event.length, max: EVENTS.length };
    default:
      return null;
  }
}

const TONES: Record<AchievementDef['category'], string> = {
  practice: 'from-[#3F6FB3] to-[#001E60]',
  streaks: 'from-[#FF7A59] to-[#BF0D3E]',
  rating: 'from-[#F5C451] to-[#C98A00]',
  arena: 'from-[#E0466F] to-[#7A0A2A]',
  chapter: 'from-[#3CC68A] to-[#1E8E5A]',
  vocab: 'from-[#8E7CF0] to-[#4B36B0]',
};

function Medal({ def, earned, size = 'md' }: { def: AchievementDef; earned: boolean; size?: 'md' | 'lg' }) {
  const Icon = ICONS[def.icon] ?? Trophy;
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-2xl',
        size === 'lg' ? 'size-16' : 'size-12',
        earned
          ? cn('bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_14px_-4px_rgb(0_30_96/0.45)]', TONES[def.category])
          : 'bg-surface-2 text-muted ring-1 ring-inset ring-line',
      )}
    >
      <Icon className={size === 'lg' ? 'size-7' : 'size-5'} strokeWidth={2.2} />
      {!earned && (
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-surface text-muted ring-1 ring-line">
          <Lock className="size-3" />
        </span>
      )}
    </span>
  );
}

export function AchievementsSection({ stats }: { stats: ProfileStats }) {
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const earnedAt = useMemo(() => new Map(stats.achievements.map((a) => [a.code, a.earned_at])), [stats.achievements]);
  const showcase = useMemo(
    () =>
      ACHIEVEMENTS.filter((a) => earnedAt.has(a.code))
        .sort((a, b) => PRESTIGE[b.code] - PRESTIGE[a.code] || (earnedAt.get(b.code) ?? '').localeCompare(earnedAt.get(a.code) ?? ''))
        .slice(0, 3),
    [earnedAt],
  );
  const list = ACHIEVEMENTS.filter((a) =>
    filter === 'all' ? true : filter === 'earned' ? earnedAt.has(a.code) : !earnedAt.has(a.code),
  ).sort((a, b) => {
    const ea = earnedAt.has(a.code) ? 0 : 1;
    const eb = earnedAt.has(b.code) ? 0 : 1;
    return ea - eb;
  });

  return (
    <div>
      {showcase.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {showcase.map((def, i) => (
            <div
              key={def.code}
              className="facets relative overflow-hidden rounded-[12px] p-4 text-white"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <Medal def={def} earned size="lg" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                    {i === 0 ? 'Top achievement' : 'Highlight'}
                  </div>
                  <div className="truncate font-display text-base font-bold">{def.title}</div>
                  <div className="text-xs text-white/70">Earned {formatDate(earnedAt.get(def.code)!, true)}</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/80">{def.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabular font-semibold text-heading">{earnedAt.size}</span> of {ACHIEVEMENTS.length} unlocked
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Filter achievements">
          {(['all', 'earned', 'locked'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'h-8 rounded-full px-3 text-xs font-semibold capitalize transition-colors',
                filter === f ? 'bg-navy text-white dark:bg-blue' : 'bg-surface-2 text-muted hover:text-ink',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((def) => {
          const at = earnedAt.get(def.code);
          const prog = at ? null : progressFor(def.code, stats);
          return (
            <li
              key={def.code}
              className={cn(
                'flex items-center gap-3 rounded-[12px] border p-3 transition-colors',
                at ? 'border-line bg-surface' : 'border-dashed border-line bg-surface/50',
              )}
            >
              <Medal def={def} earned={!!at} />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-bold', at ? 'text-heading' : 'text-ink/80')}>{def.title}</div>
                <div className="text-xs text-muted">{def.description}</div>
                {at ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                    <Check className="size-3" /> {formatDate(at, true)}
                  </div>
                ) : prog ? (
                  <ProgressBar
                    className="mt-1.5"
                    size="xs"
                    value={Math.min(prog.value, prog.max)}
                    max={prog.max}
                    label={<span className="text-[11px] text-muted">Progress</span>}
                    showValue={(v, m) => <span className="text-[11px]">{`${v} / ${m}`}</span>}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
            'flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-2',
            me && 'bg-red/[0.06] shadow-[inset_3px_0_0_var(--red)] hover:bg-red/[0.09]',
          )}
        >
          <span
            className={cn(
              'tabular w-7 shrink-0 text-center font-display text-sm font-extrabold',
              r.rank === 1 ? 'text-[#C98A00]' : r.rank === 2 ? 'text-[#8C97A8]' : r.rank === 3 ? 'text-[#9A5A2B]' : 'text-muted',
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
          <EloBadge elo={r.elo} size="sm" showTier={false} />
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
    <section className={cn('rounded-[12px] border border-line bg-surface p-4 sm:p-5', className)}>
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
