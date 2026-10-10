import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Flame, Search, SearchX, Trophy, Users, X } from 'lucide-react';
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  Select,
  Spinner,
  cn,
  tierFor,
} from '../../components/ui';
import { EVENTS, EVENT_GROUPS, eventName, type PlayerLeaderboardRow } from '../../lib/types';
import { SCAN_CAP, fmt, normalize, ordinal, pct, useDebounced, useMyStanding, usePlayerBoard, type MyStanding } from './data';
import { AccuracyMeter, EloCell, Podium, PodiumSkeleton, RankMark, RowsSkeleton, YouTag, type PodiumEntry } from './parts';

export type Scope = 'all' | 'chapter';

type Props = {
  me: { id: string; chapter_id: string | null } | null;
  event: string | null;
  onEvent: (e: string | null) => void;
  scope: Scope;
  onScope: (s: Scope) => void;
  query: string;
  onQuery: (q: string) => void;
};

const GRID = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,12rem)_7rem_5.5rem_6.5rem] md:gap-4';

export function PlayersBoard({ me, event, onEvent, scope, onScope, query, onQuery }: Props) {
  const chapterId = scope === 'chapter' ? (me?.chapter_id ?? null) : null;
  const board = usePlayerBoard(event, chapterId);
  const standing = useMyStanding(event, chapterId, me);
  const q = normalize(useDebounced(query.trim(), 180));
  const searching = q.length > 0;
  const { loadUntil, loadMore } = board;

  // Searching filters the client copy, so make sure the whole ranking (up to the cap) is loaded.
  useEffect(() => {
    if (searching) void loadUntil(() => false).catch(() => undefined);
  }, [searching, loadUntil, event, chapterId]);

  const filtered = useMemo(() => {
    if (!searching) return board.rows;
    return board.rows.filter((r) =>
      [r.display_name, r.username, r.school, r.chapter_name].some((s) => normalize(s).includes(q)),
    );
  }, [board.rows, q, searching]);

  const showPodium = !searching && board.rows.length > 0;
  const podium = showPodium ? board.rows.slice(0, 3) : [];
  const list = showPodium ? board.rows.slice(3) : filtered;
  const eloLabel = event ? 'Event Elo' : 'Elo';

  // ---------------------------------------------------------------- infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  const [moreError, setMoreError] = useState<unknown>(null);
  const more = useCallback(() => {
    setMoreError(null);
    loadMore()?.catch((e: unknown) => setMoreError(e));
  }, [loadMore]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || searching || board.done || board.loading || moreError) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [searching, board.done, board.loading, board.rows.length, more, moreError]);

  // ---------------------------------------------------------------- "you" row visibility + jump
  const meRef = useRef<HTMLElement | null>(null);
  const [meVisible, setMeVisible] = useState(false);
  const meInList = board.rows.some((r) => r.is_me);
  // React 19 ref cleanup: the observer lives exactly as long as the row element (StrictMode-safe).
  const attachMe = useCallback((el: HTMLElement | null) => {
    meRef.current = el;
    if (!el) return;
    const io = new IntersectionObserver((es) => setMeVisible(es.some((x) => x.isIntersecting)), {
      rootMargin: '-64px 0px -96px 0px',
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (meRef.current === el) meRef.current = null;
      setMeVisible(false);
    };
  }, []);

  const [jumping, setJumping] = useState(false);
  const [pendingScroll, setPendingScroll] = useState(false);
  const jump = async () => {
    if (searching) onQuery('');
    if (!meInList) {
      setJumping(true);
      try {
        await loadUntil((rows) => rows.some((r) => r.is_me));
      } catch (e) {
        setMoreError(e);
      } finally {
        setJumping(false);
      }
    }
    setPendingScroll(true);
  };
  useEffect(() => {
    if (!pendingScroll || !meRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    meRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    meRef.current.focus({ preventScroll: true });
    setPendingScroll(false);
  }, [pendingScroll, meInList, board.rows.length]);

  const podiumEntries: PodiumEntry[] = podium.map((r) => ({
    id: r.user_id,
    rank: r.rank,
    name: r.display_name,
    sub: r.chapter_name ?? r.school ?? `@${r.username}`,
    avatar: r.avatar_url,
    score: r.elo,
    scoreLabel: eloLabel,
    tierElo: r.elo,
    me: r.is_me,
    to: `/u/${r.username}`,
  }));

  const eventOptions = EVENT_GROUPS.map((g) => ({
    label: g.label,
    events: EVENTS.filter((e) => e.group === g.id),
  }));

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-3 shadow-card sm:p-4 lg:flex-row lg:items-end">
        <Input
          className="lg:flex-1"
          label="Search players"
          placeholder="Name, username, school or chapter"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          leftIcon={<Search />}
          type="search"
          autoComplete="off"
          right={
            query ? (
              <button
                type="button"
                onClick={() => onQuery('')}
                className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : undefined
          }
        />
        <Select
          className="lg:w-72"
          label="Event"
          value={event ?? ''}
          onChange={(e) => onEvent(e.target.value || null)}
        >
          <option value="">All events (overall Elo)</option>
          {eventOptions.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.events.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                  {e.isNew ? ' (new)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink" id="lb-scope-label">
            Show
          </span>
          {me?.chapter_id ? (
            <SegmentedControl<Scope>
              aria-label="Show players from"
              className="h-10 items-center"
              value={scope}
              onChange={onScope}
              options={[
                { value: 'all', label: 'Everyone', icon: <Trophy /> },
                { value: 'chapter', label: 'My chapter', icon: <Users /> },
              ]}
            />
          ) : (
            <Link
              to="/chapter"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 text-sm font-semibold text-link hover:border-blue hover:bg-blue/5"
            >
              <Users className="size-4" />
              Join a chapter to compare
            </Link>
          )}
        </div>
      </div>

      {/* Context line */}
      {!board.loading && !board.error && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p aria-live="polite">
            {searching ? (
              <>
                <span className="tabular font-semibold text-ink">{fmt.format(filtered.length)}</span>{' '}
                {filtered.length === 1 ? 'match' : 'matches'}
                {board.loadingMore && ' so far'}
                {board.total > SCAN_CAP && ` in the top ${fmt.format(SCAN_CAP)}`}
              </>
            ) : (
              <>
                <span className="tabular font-semibold text-ink">{fmt.format(board.total)}</span>{' '}
                {board.total === 1 ? 'player' : 'players'} ranked
                {scope === 'chapter' && ' in your chapter'}
                {event && (
                  <>
                    {' '}
                    in <span className="font-semibold text-ink">{eventName(event)}</span>
                  </>
                )}
              </>
            )}
          </p>
          {event && !searching && (
            <p className="text-xs">Event Elo is the Elo you have gained from {eventName(event)} questions.</p>
          )}
        </div>
      )}

      {board.error ? (
        <ErrorState title="Could not load the leaderboard" error={board.error} onRetry={board.reload} />
      ) : board.loading ? (
        <>
          {!searching && (
            <div className="rounded-[12px] border border-line bg-surface px-3 pb-0 pt-10 shadow-card sm:px-8">
              <PodiumSkeleton />
            </div>
          )}
          <div className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-card">
            <RowsSkeleton />
          </div>
        </>
      ) : board.rows.length === 0 ? (
        <BoardEmpty event={event} scope={scope} />
      ) : (
        <>
          {showPodium && (
            <section
              aria-label="Podium"
              ref={podium.some((r) => r.is_me) ? attachMe : undefined}
              tabIndex={podium.some((r) => r.is_me) ? -1 : undefined}
              className="relative overflow-hidden outline-none rounded-[12px] border border-line bg-surface px-2 pt-10 shadow-card sm:px-8"
            >
              <span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_100%,rgb(63_111_179/0.12),transparent_70%)]"
                aria-hidden
              />
              <div className="relative mx-auto max-w-2xl">
                <Podium entries={podiumEntries} />
              </div>
            </section>
          )}

          {searching && filtered.length === 0 && !board.loadingMore ? (
            <EmptyState
              icon={<SearchX />}
              title={`No players match "${query.trim()}"`}
              description="Try a first name, a username or a school."
              action={
                <Button variant="outline" onClick={() => onQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : list.length > 0 || board.loadingMore ? (
            <div className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-card">
              <div
                className={cn(
                  GRID,
                  'hidden border-b border-line bg-surface-2/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted md:grid',
                )}
                aria-hidden
              >
                <span className="text-center">#</span>
                <span>Player</span>
                <span>Chapter</span>
                <span>Accuracy</span>
                <span className="text-right">Questions</span>
                <span className="text-right">{eloLabel}</span>
              </div>
              <ol className="divide-y divide-line" aria-label="Rankings">
                {list.map((r) => (
                  <PlayerRow key={r.user_id} row={r} rowRef={r.is_me ? attachMe : undefined} eloLabel={eloLabel} />
                ))}
              </ol>
              {searching && board.loadingMore && (
                <div className="flex items-center justify-center gap-2 border-t border-line py-4 text-sm text-muted">
                  <Spinner className="size-4" /> Searching every player
                </div>
              )}
            </div>
          ) : null}

          {!searching && (
            <div ref={sentinel} className="flex justify-center py-2">
              {moreError ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted">
                  Could not load more players.
                  <Button size="sm" variant="outline" onClick={more}>
                    Try again
                  </Button>
                </div>
              ) : board.loadingMore ? (
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Spinner className="size-4" /> Loading more
                </span>
              ) : !board.done ? (
                <Button size="sm" variant="outline" onClick={more}>
                  Load more players
                </Button>
              ) : board.rows.length > 10 ? (
                <span className="text-xs text-muted">That is everyone. Keep practising to climb.</span>
              ) : null}
            </div>
          )}
        </>
      )}

      {!board.loading && !board.error && board.rows.length > 0 && (
        <PinnedMe
          standing={standing}
          event={event}
          hidden={(meInList && meVisible) || (searching && filtered.some((r) => r.is_me))}
          onJump={jump}
          jumping={jumping}
          canJump={standing.status === 'ranked' && (meInList || standing.row.rank <= SCAN_CAP)}
          above={
            standing.status === 'ranked'
              ? [...board.rows].reverse().find((r) => r.elo > standing.row.elo && !r.is_me)
              : undefined
          }
          eloLabel={eloLabel}
        />
      )}
    </div>
  );
}

function PlayerRow({
  row: r,
  rowRef,
  eloLabel,
}: {
  row: PlayerLeaderboardRow;
  rowRef?: (el: HTMLElement | null) => void | (() => void);
  eloLabel: string;
}) {
  const tier = tierFor(r.elo);
  return (
    <li>
      <Link
        ref={rowRef}
        to={`/u/${r.username}`}
        className={cn(
          GRID,
          'relative px-4 py-3 outline-none transition-colors duration-150 hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          r.is_me && 'bg-red/[0.06] shadow-[inset_3px_0_0_var(--red)] hover:bg-red/[0.09]',
        )}
        aria-label={`${ordinal(r.rank)}: ${r.display_name}${r.is_me ? ' (you)' : ''}, ${r.elo} ${eloLabel}`}
      >
        <RankMark rank={r.rank} me={r.is_me} className="justify-self-center" />
        <span className="flex min-w-0 items-center gap-3">
          <Avatar src={r.avatar_url} name={r.display_name} size="md" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('truncate font-display font-semibold text-heading', r.is_me && 'text-red dark:text-danger')}>
                {r.display_name}
              </span>
              {r.is_me && (
                <YouTag />
              )}
              {r.current_streak >= 3 && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-warning"
                  title={`${r.current_streak}-day streak`}
                >
                  <Flame className="size-3.5" aria-hidden />
                  <span className="tabular">{r.current_streak}</span>
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-muted">
              @{r.username}
              <span className="md:hidden">
                {r.chapter_name ? ` · ${r.chapter_name}` : r.school ? ` · ${r.school}` : ''}
              </span>
              <span className="md:hidden"> · {pct(r.accuracy)} · {fmt.format(r.questions_answered)} Q</span>
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-sm text-ink">{r.chapter_name ?? <span className="text-muted">No chapter</span>}</span>
          {r.school && <span className="block truncate text-xs text-muted">{r.school}</span>}
        </span>
        <span className="hidden md:block">
          <AccuracyMeter value={r.accuracy} answered={r.questions_answered} />
        </span>
        <span className="tabular hidden text-right text-sm text-ink md:block">{fmt.format(r.questions_answered)}</span>
        <span className="flex flex-col items-end">
          <EloCell elo={r.elo} />
          <span className="text-[11px] font-semibold dark:!text-white/70" style={{ color: tier.ink }}>
            {tier.name}
          </span>
        </span>
      </Link>
    </li>
  );
}

function PinnedMe({
  standing,
  event,
  hidden,
  onJump,
  jumping,
  canJump,
  above,
  eloLabel,
}: {
  standing: MyStanding;
  event: string | null;
  hidden: boolean;
  onJump: () => void;
  jumping: boolean;
  canJump: boolean;
  above?: PlayerLeaderboardRow;
  eloLabel: string;
}) {
  if (hidden || standing.status === 'loading' || standing.status === 'unknown') return null;
  const shell =
    'animate-rise sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 rounded-[14px] border border-red/30 bg-surface/95 shadow-pop backdrop-blur-md md:bottom-4';

  if (standing.status === 'unranked') {
    return (
      <div className={cn(shell, 'flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4')} role="status">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red/10 text-red">
          <Trophy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-heading">You are not on this board yet</p>
          <p className="text-sm text-muted">
            {event ? `Answer a ${eventName(event)} question to get ranked here.` : 'Answer a question to get ranked.'}
          </p>
        </div>
        <ButtonLink to={event ? `/play/${event}` : '/play'} variant="accent" size="sm">
          Start practising
        </ButtonLink>
      </div>
    );
  }

  const r = standing.row;
  const gap = above ? above.elo - r.elo : null;
  return (
    <div className={cn(shell, 'flex items-center gap-3 px-3 py-2.5 sm:px-4')} aria-label="Your position">
      <span className="tabular grid h-10 min-w-10 shrink-0 place-items-center rounded-full bg-red px-2 font-display text-sm font-extrabold text-white">
        {r.rank}
      </span>
      <Avatar src={r.avatar_url} name={r.display_name} size="md" className="max-sm:hidden" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-semibold text-heading">
          You are {ordinal(r.rank)}
          <span className="font-normal text-muted"> of {fmt.format(r.total_count)}</span>
        </p>
        <p className="truncate text-xs text-muted">
          {gap != null && gap > 0
            ? `${fmt.format(gap)} ${eloLabel} behind ${above!.display_name}`
            : r.rank === 1
              ? 'Top of the board. Defend it.'
              : `${pct(r.accuracy)} accuracy · ${fmt.format(r.questions_answered)} questions`}
        </p>
      </div>
      <EloCell elo={r.elo} />
      {canJump && (
        <Button
          size="sm"
          variant="outline"
          onClick={onJump}
          loading={jumping}
          leftIcon={<ArrowDownToLine className="size-4" />}
          className="max-sm:px-2.5"
          aria-label="Jump to my row"
        >
          <span className="max-sm:hidden">Jump to me</span>
        </Button>
      )}
    </div>
  );
}

function BoardEmpty({ event, scope }: { event: string | null; scope: Scope }) {
  if (event)
    return (
      <EmptyState
        icon={<Trophy />}
        title={`No one is ranked in ${eventName(event)} yet`}
        description={
          scope === 'chapter'
            ? 'Nobody in your chapter has answered a question in this event. Be the first on the board.'
            : 'Answer a question in this event and you will be first on the board.'
        }
        action={
          <ButtonLink to={`/play/${event}`} variant="accent">
            Practise {eventName(event)}
          </ButtonLink>
        }
      />
    );
  return (
    <EmptyState
      icon={<Trophy />}
      title={scope === 'chapter' ? 'Your chapter board is empty' : 'The leaderboard is wide open'}
      description="Every question you answer moves your Elo. Play a practice paper to claim the top spot."
      action={
        <ButtonLink to="/play" variant="accent">
          Start practising
        </ButtonLink>
      }
    />
  );
}
