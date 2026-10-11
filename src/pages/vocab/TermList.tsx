import { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, Input, Pill, ScrollRow, useToast, errorMessage } from '../../components/ui';
import type { StudyDeck } from '../../api/vocab';
import { STATUS_LABEL, isDue, relativeDue, statusOf, type ProgressLike, type TermStatus } from './leitner';
import { resetTerms } from './store';
import { Highlight, StatusChip } from './parts';

type Filter = 'all' | 'due' | TermStatus;

/** Browse every term in the deck with its schedule. */
export function TermList({
  deck,
  progress,
  initialQuery = '',
}: {
  deck: StudyDeck;
  progress: ReadonlyMap<string, ProgressLike>;
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: deck.terms.length, due: 0, new: 0, learning: 0, review: 0, mastered: 0 };
    for (const t of deck.terms) {
      const p = progress.get(t.id);
      c[statusOf(p)]++;
      if (isDue(p)) c.due++;
    }
    return c;
  }, [deck.terms, progress]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deck.terms.filter((t) => {
      const p = progress.get(t.id);
      if (filter === 'due' ? !isDue(p) : filter !== 'all' && statusOf(p) !== filter) return false;
      return !needle || t.term.toLowerCase().includes(needle) || t.def.toLowerCase().includes(needle);
    });
  }, [deck.terms, progress, q, filter]);

  const studied = deck.terms.length - counts.new;
  const filters: Filter[] = ['all', 'due', 'new', 'learning', 'review', 'mastered'];

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          aria-label="Search this deck"
          placeholder={`Search ${deck.terms.length} terms`}
          leftIcon={<Search />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:w-80"
        />
        {studied > 0 && (
          <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="size-4" />} onClick={() => setConfirm(true)}>
            Reset deck progress
          </Button>
        )}
      </div>
      <ScrollRow className="-mx-4 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {filters.map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)} count={counts[f]}>
            {f === 'all' ? 'All' : f === 'due' ? 'Due today' : STATUS_LABEL[f]}
          </Pill>
        ))}
      </ScrollRow>

      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No terms here"
          description={q ? `Nothing matches "${q}".` : 'No terms in this group yet.'}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ('');
                setFilter('all');
              }}
            >
              Show all terms
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
          {rows.map((t) => {
            const p = progress.get(t.id);
            const st = statusOf(p);
            return (
              <li key={t.id} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-start sm:gap-5">
                <div className="font-display font-bold leading-snug text-heading">
                  <Highlight text={t.term} query={q} />
                </div>
                <p className="text-sm leading-relaxed text-ink">
                  <Highlight text={t.def} query={q} />
                </p>
                <div className="mt-1 flex items-center gap-2 sm:mt-0 sm:flex-col sm:items-end sm:gap-1">
                  <StatusChip status={st} />
                  {p && (
                    <span className="tabular text-[11px] text-muted">
                      {isDue(p) ? 'Due today' : `Next ${relativeDue(p.due_at)}`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset this deck?"
        description={`Your progress on ${studied} studied ${studied === 1 ? 'term' : 'terms'} in ${deck.title} will be cleared and they will be new again. This can't be undone.`}
        confirmLabel="Reset progress"
        variant="danger"
        onConfirm={async () => {
          try {
            await resetTerms(deck.terms.map((t) => t.id));
            toast.success('Deck progress reset');
            setConfirm(false);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
