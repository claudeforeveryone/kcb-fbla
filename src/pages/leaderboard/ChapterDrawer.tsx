import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { playerLeaderboard } from '../../api/core';
import { Avatar, ButtonLink, EmptyState, ErrorState, Modal, cn } from '../../components/ui';
import type { ChapterLeaderboardRow, PlayerLeaderboardRow } from '../../lib/types';
import { fmt, ordinal, pct } from './data';
import { AccuracyMeter, ChapterCrest, YouTag, EloCell, RankMark, RowsSkeleton } from './parts';

/** Modal with a chapter's headline numbers and its own member leaderboard. */
export function ChapterDrawer({ chapter, onClose }: { chapter: ChapterLeaderboardRow | null; onClose: () => void }) {
  const [members, setMembers] = useState<PlayerLeaderboardRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const id = chapter?.chapter_id ?? null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setMembers(null);
    setError(null);
    playerLeaderboard({ chapterId: id, limit: 200 })
      .then((rows) => alive && setMembers(rows))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [id, nonce]);

  const c = chapter;
  const accuracy = members && members.length
    ? (() => {
        const a = members.reduce((s, m) => s + m.questions_answered, 0);
        const k = members.reduce((s, m) => s + m.questions_correct, 0);
        return a ? k / a : null;
      })()
    : null;

  return (
    <Modal
      open={!!c}
      onClose={onClose}
      size="lg"
      title={
        c && (
          <span className="flex items-center gap-3">
            <ChapterCrest name={c.name} size="lg" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate">{c.name}</span>
                {c.is_mine && (
                  <YouTag>Yours</YouTag>
                )}
              </span>
              <span className="block text-sm font-normal text-muted">
                {[c.school, c.region].filter(Boolean).join(' · ') || 'Independent chapter'}
              </span>
            </span>
          </span>
        )
      }
      footer={
        c?.is_mine ? (
          <ButtonLink to="/chapter" variant="primary" rightIcon={<ArrowRight className="size-4" />}>
            Open my chapter
          </ButtonLink>
        ) : undefined
      }
    >
      {c && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Chapter rank" value={ordinal(c.rank)} accent />
            <Stat label="Total Elo" value={fmt.format(c.total_elo)} />
            <Stat label="Average Elo" value={fmt.format(c.avg_elo)} />
            <Stat label="Members" value={fmt.format(c.member_count)} />
          </dl>

          {members && members.length > 0 && (
            <EloSpread members={members} questions={c.questions_answered} accuracy={accuracy} />
          )}

          <section aria-label="Member leaderboard">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Member leaderboard</h3>
            {error ? (
              <ErrorState title="Could not load members" error={error} onRetry={() => setNonce((n) => n + 1)} />
            ) : !members ? (
              <div className="overflow-hidden rounded-[4px] border border-line">
                <RowsSkeleton rows={5} />
              </div>
            ) : members.length === 0 ? (
              <EmptyState compact title="No members yet" description="This chapter has not signed anyone up." />
            ) : (
              <ol className="divide-y divide-line overflow-hidden rounded-[4px] border border-line">
                {members.map((m, i) => (
                  <li key={m.user_id}>
                    <Link
                      to={`/u/${m.username}`}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4',
                        m.is_me && 'bg-red/[0.06] shadow-[inset_3px_0_0_var(--red)]',
                      )}
                    >
                      <RankMark rank={m.rank} me={m.is_me} />
                      <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate font-display text-sm font-semibold text-heading', m.is_me && 'text-red dark:text-danger')}>
                          {m.display_name}
                          {m.is_me && <span className="font-normal text-muted"> (you)</span>}
                          {c.top_user_id === m.user_id && i === 0 && members.length > 1 && (
                            <span className="sr-only">, top player</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          @{m.username} · {fmt.format(m.questions_answered)} questions
                          <span className="sm:hidden"> · {pct(m.accuracy)}</span>
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        <AccuracyMeter value={m.accuracy} answered={m.questions_answered} />
                      </span>
                      <EloCell elo={m.elo} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-[4px] border px-3 py-2.5', accent ? 'border-navy bg-navy text-white dark:border-blue/40' : 'border-line bg-surface-2/50')}>
      <dt className={cn('text-[11px] font-bold uppercase tracking-wider', accent ? 'text-white/70' : 'text-muted')}>{label}</dt>
      <dd className={cn('tabular mt-0.5 font-display text-xl font-extrabold', accent ? 'text-white' : 'text-heading')}>{value}</dd>
    </div>
  );
}

/** Where the chapter's members sit on the Elo scale, plus total practice volume. */
function EloSpread({
  members,
  questions,
  accuracy,
}: {
  members: PlayerLeaderboardRow[];
  questions: number;
  accuracy: number | null;
}) {
  const elos = members.map((m) => m.elo).sort((a, b) => a - b);
  const mid = Math.floor(elos.length / 2);
  const median = elos.length % 2 ? elos[mid] : Math.round((elos[mid - 1] + elos[mid]) / 2);
  const cells = [
    { label: 'Highest Elo', value: fmt.format(Math.round(elos[elos.length - 1])) },
    { label: 'Median Elo', value: fmt.format(Math.round(median)) },
    { label: 'Lowest Elo', value: fmt.format(Math.round(elos[0])) },
  ];
  return (
    <div className="rounded-[4px] border border-line p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Elo spread</h3>
        <p className="text-xs text-muted">
          <span className="tabular font-semibold text-ink">{fmt.format(questions)}</span> questions answered
          {accuracy != null && (
            <>
              {' '}
              at <span className="tabular font-semibold text-ink">{pct(accuracy)}</span>
            </>
          )}
        </p>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line pt-3 text-center">
        {cells.map((c) => (
          <div key={c.label} className="px-2">
            <dd className="tabular font-display text-lg font-extrabold text-heading">{c.value}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
