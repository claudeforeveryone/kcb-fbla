import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { Avatar, Button, ButtonLink, EmptyState, ErrorState, Input, Spinner, cn } from '../../components/ui';
import type { ChapterLeaderboardRow } from '../../lib/types';
import { ChapterDrawer } from './ChapterDrawer';
import { fmt, normalize, ordinal, useChapterBoard, useDebounced } from './data';
import { ChapterCrest, YouTag, EloCell, RankMark, RowsSkeleton } from './parts';

// Phone: rank | chapter | total Elo. md adds members, avg Elo, top player; lg adds school.
const GRID =
  'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[3rem_minmax(0,1.5fr)_5.5rem_6rem_5.5rem_minmax(0,1fr)_1rem] md:gap-4 lg:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_6rem_5.5rem_minmax(0,1fr)_1rem]';

export function ChaptersBoard({ myChapterId }: { myChapterId: string | null }) {
  const board = useChapterBoard();
  const [query, setQuery] = useState('');
  const q = normalize(useDebounced(query.trim(), 180));
  const searching = q.length > 0;
  const [open, setOpen] = useState<ChapterLeaderboardRow | null>(null);
  const { loadUntil } = board;

  useEffect(() => {
    if (searching) void loadUntil(() => false).catch(() => undefined);
  }, [searching, loadUntil]);

  const filtered = useMemo(
    () =>
      searching
        ? board.rows.filter((r) => [r.name, r.school, r.region].some((s) => normalize(s).includes(q)))
        : board.rows,
    [board.rows, q, searching],
  );
  const list = filtered;
  const mine = board.rows.find((r) => r.is_mine);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-3 sm:flex-row sm:items-end sm:p-4">
        <Input
          className="sm:flex-1"
          label="Search chapters"
          placeholder="Chapter name, school or region"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leftIcon={<Search />}
          type="search"
          autoComplete="off"
          right={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : undefined
          }
        />
        {mine ? (
          <Button variant="outline" onClick={() => setOpen(mine)}>
            My chapter is {ordinal(mine.rank)}
          </Button>
        ) : !myChapterId ? (
          <ButtonLink to="/chapter" variant="outline">
            Join or start a chapter
          </ButtonLink>
        ) : null}
      </div>

      {!board.loading && !board.error && board.rows.length > 0 && (
        <p className="text-sm text-ink" aria-live="polite">
          {searching ? (
            <>
              <span className="tabular font-semibold text-ink">{filtered.length}</span> {filtered.length === 1 ? 'match' : 'matches'}
            </>
          ) : (
            <>
              <span className="tabular font-semibold text-ink">{fmt.format(board.total)}</span>{' '}
              {board.total === 1 ? 'chapter' : 'chapters'}, ranked by the total Elo of every member
            </>
          )}
        </p>
      )}

      {board.error ? (
        <ErrorState title="Could not load chapters" error={board.error} onRetry={board.reload} />
      ) : board.loading ? (
        <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
          <RowsSkeleton rows={8} />
        </div>
      ) : board.rows.length === 0 ? (
        <EmptyState
          title="No chapters yet"
          description="Register your school's chapter, invite your members and climb this board together."
          action={
            <ButtonLink to={myChapterId ? '/chapter' : '/chapter/new'} variant="accent">
              {myChapterId ? 'Open my chapter' : 'Register a chapter'}
            </ButtonLink>
          }
        />
      ) : (
        <>
          {searching && filtered.length === 0 && !board.loadingMore ? (
            <EmptyState
              title={`No chapters match "${query.trim()}"`}
              action={
                <Button variant="outline" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : list.length > 0 ? (
            <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
              <div
                className={cn(
                  GRID,
                  'hidden border-b border-line bg-surface px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-heading md:grid',
                )}
                aria-hidden
              >
                <span className="text-center">#</span>
                <span>Chapter</span>
                <span className="hidden lg:block">School</span>
                <span className="text-right">Members</span>
                <span className="text-right">Total Elo</span>
                <span className="text-right">Avg Elo</span>
                <span>Top player</span>
                <span />
              </div>
              <ol className="divide-y divide-line" aria-label="Chapter rankings">
                {list.map((r) => (
                  <ChapterRow key={r.chapter_id} row={r} onOpen={() => setOpen(r)} />
                ))}
              </ol>
            </div>
          ) : null}

          {!searching && !board.done && (
            <div className="flex justify-center">
              <Button size="sm" variant="outline" onClick={() => void board.loadMore().catch(() => undefined)} loading={board.loadingMore}>
                Load more chapters
              </Button>
            </div>
          )}
          {searching && board.loadingMore && (
            <p className="flex items-center justify-center gap-2 text-sm text-ink">
              <Spinner className="size-4" /> Searching every chapter
            </p>
          )}
        </>
      )}

      <ChapterDrawer chapter={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ChapterRow({ row: r, onOpen }: { row: ChapterLeaderboardRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          GRID,
          'group min-h-[68px] w-full px-4 py-3.5 text-left outline-none transition-colors duration-150 hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          r.is_mine && 'bg-red/[0.06] shadow-[inset_3px_0_0_var(--red)] hover:bg-red/[0.09]',
        )}
        aria-label={`${ordinal(r.rank)}: ${r.name}${r.is_mine ? ' (your chapter)' : ''}, ${r.total_elo} total Elo. Show members`}
      >
        <RankMark rank={r.rank} me={r.is_mine} className="justify-self-center" />
        <span className="flex min-w-0 items-center gap-3">
          <ChapterCrest name={r.name} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('truncate font-display font-semibold text-heading', r.is_mine && 'text-red dark:text-danger')}>
                {r.name}
              </span>
              {r.is_mine && <YouTag>Yours</YouTag>}
            </span>
            <span className="block truncate text-xs text-ink lg:hidden">
              {r.school || r.region || 'Independent chapter'}
              <span className="md:hidden">
                {' '}
                · {fmt.format(r.member_count)} {r.member_count === 1 ? 'member' : 'members'}
              </span>
            </span>
            {r.region && r.school && <span className="hidden truncate text-xs text-ink lg:block">{r.region}</span>}
          </span>
        </span>
        <span className="hidden min-w-0 truncate text-sm text-ink lg:block">{r.school || '-'}</span>
        <span className="tabular hidden text-right text-sm text-ink md:block">{fmt.format(r.member_count)}</span>
        <span className="flex flex-col items-end">
          <EloCell elo={r.total_elo} label="Total Elo" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-heading md:hidden">Total Elo</span>
        </span>
        <span className="tabular hidden text-right text-sm text-ink md:block">{fmt.format(Math.round(r.avg_elo))}</span>
        <span className="hidden min-w-0 items-center gap-2 md:flex">
          {r.top_user_id ? (
            <>
              <Avatar src={r.top_avatar_url} name={r.top_display_name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.top_display_name}</span>
                <span className="tabular block text-xs text-ink">{fmt.format(Math.round(r.top_elo ?? 0))} Elo</span>
              </span>
            </>
          ) : (
            <span className="text-sm text-ink">No members</span>
          )}
        </span>
        <ChevronRight
          className="hidden size-4 text-heading transition-transform duration-150 group-hover:translate-x-0.5 md:block"
          aria-hidden
        />
      </button>
    </li>
  );
}
