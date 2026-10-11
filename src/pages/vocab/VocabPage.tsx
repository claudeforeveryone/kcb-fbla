import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
  SkeletonCards,
  cn,
} from '../../components/ui';
import { Page, Section } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { EVENT_GROUPS, type Assignment, type Deck } from '../../lib/types';
import { canManageDeck, isDeckStaff, type StudyDeck, type VocabTerm } from '../../api/vocab';
import { deckStats, isDue, relativeDue, statusOf, type DeckStats, type ProgressLike } from './leitner';
import { assignmentFor, reloadVocab, useVocab, type VocabState } from './store';
import { DeckBlock, DeckCrest, EventBar, Highlight, StatusChip, deckColor, deckVars } from './parts';
import { DeckEditor } from './DeckEditor';

export default function VocabPage() {
  const { user, profile } = useAuth();
  const s = useVocab(user?.id, profile?.chapter_id);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; deck: Deck | null }>({ open: false, deck: null });

  const allDecks = useMemo(() => [...s.chapterDecks, ...s.eventDecks], [s.chapterDecks, s.eventDecks]);
  const stats = useMemo(() => {
    const m = new Map<string, DeckStats>();
    for (const d of allDecks) m.set(d.key, deckStats(d.terms.map((t) => t.id), s.progress));
    return m;
  }, [allDecks, s.progress]);

  const totals = useMemo(() => {
    let due = 0;
    let mastered = 0;
    let studied = 0;
    let terms = 0;
    for (const d of allDecks) {
      const st = stats.get(d.key)!;
      due += st.due;
      mastered += st.mastered;
      studied += st.total - st.fresh;
      terms += st.total;
    }
    return { due, mastered, studied, terms };
  }, [allDecks, stats]);

  const loading = s.status === 'idle' || s.status === 'loading';
  const firstLoad = loading && !s.eventDecks.length;
  const mainEvent = profile?.main_event ?? null;
  const featured = s.eventDecks.find((d) => d.key === mainEvent);
  const staff = isDeckStaff(s.scope);

  return (
    <>
      <PageHeader
        eyebrow="Study"
        title="Vocab"
        subtitle="Every event's key terms, scheduled so each one comes back right before you would forget it."
        actions={
          totals.due > 0 ? (
            <ButtonLink to="/vocab/review?mode=learn" variant="accent" size="lg" rightIcon={<ArrowRight className="size-5" />}>
              Review {totals.due} due
            </ButtonLink>
          ) : featured ? (
            <ButtonLink to={`/vocab/${featured.key}?mode=learn`} variant="inverse" size="lg" rightIcon={<ArrowRight className="size-5" />}>
              Learn {featured.short}
            </ButtonLink>
          ) : undefined
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
          <HeaderStat label="Due today" value={firstLoad ? null : totals.due} accent={totals.due > 0} />
          <HeaderStat label="Mastered" value={firstLoad ? null : totals.mastered} blue />
          <HeaderStat label="Studied" value={firstLoad ? null : `${totals.studied}`} suffix={firstLoad ? '' : ` / ${totals.terms}`} blue />
        </div>
      </PageHeader>

      <Page>
        {s.status === 'error' && !s.eventDecks.length ? (
          <ErrorState title="Vocab didn't load" error={s.error} onRetry={reloadVocab} />
        ) : (
          <>
            {s.saveError && (
              <div role="status" className="mb-4 rounded-[8px] border-l-[3px] border-warning bg-warning/12 px-3 py-2 text-sm font-semibold text-[#8a5f00] dark:text-warning">
                Some reviews haven't saved yet ({s.saveError}). We'll keep retrying.
              </div>
            )}
            <Input
              size="lg"
              aria-label="Search all vocab"
              placeholder={firstLoad ? 'Search terms' : `Search ${totals.terms.toLocaleString()} terms and definitions`}
              leftIcon={<Search />}
              inputClassName="rounded-[12px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              right={
                query ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQuery('')}>
                    <X className="size-4" />
                  </Button>
                ) : undefined
              }
            />

            {query.trim() ? (
              <SearchResults query={query} decks={allDecks} progress={s.progress} onClear={() => setQuery('')} />
            ) : firstLoad ? (
              <div className="mt-8 grid gap-4">
                <Skeleton className="h-36 w-full" rounded="rounded-[12px]" />
                <SkeletonCards count={6} />
              </div>
            ) : (
              <>
                {featured && <Featured deck={featured} stats={stats.get(featured.key)!} />}

                <ChapterDecks
                  s={s}
                  stats={stats}
                  staff={staff}
                  onNew={() => setEditor({ open: true, deck: null })}
                  onEdit={(deck) => setEditor({ open: true, deck })}
                />

                {EVENT_GROUPS.map((g) => {
                  const decks = s.eventDecks.filter((d) => d.group === g.id);
                  if (!decks.length) return null;
                  return (
                    <Section key={g.id} title={g.label} description={`${decks.length} events, ${decks.reduce((n, d) => n + d.terms.length, 0)} terms`}>
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                        {decks.map((d) => (
                          <DeckTile key={d.key} deck={d} stats={stats.get(d.key)!} main={d.key === mainEvent} />
                        ))}
                      </div>
                    </Section>
                  );
                })}
              </>
            )}
          </>
        )}
      </Page>

      {profile?.chapter_id && s.scope && (
        <DeckEditor
          open={editor.open}
          deck={editor.deck}
          chapterId={profile.chapter_id}
          scope={s.scope}
          onClose={() => setEditor((e) => ({ ...e, open: false }))}
        />
      )}
    </>
  );
}

function HeaderStat({
  label,
  value,
  suffix,
  accent,
  blue,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  accent?: boolean;
  blue?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 overflow-hidden rounded-[12px] border px-3 py-2.5 sm:min-w-40 sm:px-4',
        blue
          ? 'border-blue bg-blue text-white'
          : accent
            ? 'border-line border-t-[3px] border-t-red bg-surface'
            : 'border-line bg-surface',
      )}
    >
      <div className="min-w-0">
        <div className={cn('tabular font-display text-xl font-extrabold leading-none sm:text-2xl', accent ? 'text-red' : 'text-white')}>
          {value === null ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/20" /> : value}
          {suffix && <span className={cn('text-sm font-semibold', blue ? 'text-white/85' : 'text-white/60')}>{suffix}</span>}
        </div>
        <div className={cn('mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.1em]', blue ? 'text-white/90' : 'text-white/70')}>{label}</div>
      </div>
    </div>
  );
}

function Featured({ deck, stats }: { deck: StudyDeck; stats: DeckStats }) {
  const started = stats.total - stats.fresh > 0;
  const color = deckColor(deck);
  return (
    <section
      className="mt-6 flex flex-col overflow-hidden rounded-[12px] border border-line bg-surface sm:flex-row"
      style={deckVars(color)}
      aria-label={`Your event: ${deck.title}`}
    >
      <DeckBlock deck={deck} className="h-32 shrink-0 sm:h-auto sm:w-56">
        <div className="grid h-full place-items-center">
          <DeckCrest deck={deck} size={76} />
        </div>
      </DeckBlock>
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color }}>
              Your event
            </span>
            <CodeTag>{deck.short}</CodeTag>
          </div>
          <h2 className="mt-1 text-2xl font-extrabold">{deck.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {!started
              ? `${stats.total} terms waiting. Ten new ones a session is a good pace.`
              : stats.due > 0
                ? `${stats.due} due today, ${stats.mastered} mastered, ${stats.fresh} still new.`
                : `All caught up. ${stats.mastered} mastered${stats.nextDue ? `, next review ${relativeDue(stats.nextDue)}` : ''}.`}
          </p>
          <div className="mt-3 flex max-w-md items-center gap-3">
            <EventBar stats={stats} color={color} className="flex-1" />
            <span className="tabular shrink-0 text-xs font-semibold text-muted">
              {stats.mastered} / {stats.total}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
          <ButtonLink
            to={`/vocab/${deck.key}?mode=learn`}
            variant="accent"
            className="rounded-[8px]"
            rightIcon={<ArrowRight className="size-4" />}
          >
            {stats.due > 0 ? `Review ${stats.due}` : started ? 'Keep learning' : 'Start learning'}
          </ButtonLink>
          <ButtonLink to={`/vocab/${deck.key}?mode=cards`} variant="outline" className="rounded-[8px]">
            Flashcards
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** Small grey bordered chip for an event's short code (ACCT, LAW...). */
function CodeTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[2px] border border-line px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
      {children}
    </span>
  );
}

function DeckTile({
  deck,
  stats,
  main,
  assignment,
  onEdit,
}: {
  deck: StudyDeck;
  stats: DeckStats;
  main?: boolean;
  assignment?: Assignment;
  onEdit?: () => void;
}) {
  const started = stats.total - stats.fresh > 0;
  const complete = stats.total > 0 && stats.mastered === stats.total;
  const color = deckColor(deck);
  const status = complete
    ? 'Fully mastered'
    : stats.due > 0
      ? `${stats.due} due today`
      : !started
        ? 'Not started'
        : `${stats.mastered} of ${stats.total} mastered`;
  return (
    <div className="group relative h-full" style={deckVars(color)}>
      <Link
        to={`/vocab/${deck.key}`}
        className="flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface outline-none transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-blue"
      >
        <DeckBlock deck={deck} className="h-[128px] shrink-0">
          <div className="grid h-full place-items-center">
            <DeckCrest deck={deck} size={68} className="transition-transform duration-200 group-hover:scale-[1.05]" />
          </div>
          {(main || deck.isNew) && (
            <div className="absolute left-3 top-3 flex gap-1.5">
              {main && (
                <span className="inline-flex h-5 items-center rounded-[2px] bg-white px-1.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
                  Your event
                </span>
              )}
              {deck.isNew && (
                <span className="inline-flex h-5 items-center rounded-[2px] border border-white/80 px-1.5 text-[10px] font-bold tracking-[0.08em] text-white">
                  *NEW
                </span>
              )}
            </div>
          )}
        </DeckBlock>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold leading-snug text-heading">{deck.title}</h3>
            <CodeTag>{deck.short}</CodeTag>
          </div>
          {deck.gradeNote && <p className="mt-1 text-xs font-semibold text-[#8a5f00] dark:text-warning">{deck.gradeNote}</p>}
          <p className="tabular mt-1.5 text-sm text-muted">
            {stats.total} {stats.total === 1 ? 'term' : 'terms'}
            {started && ` · ${stats.mastered} mastered`}
            {stats.due > 0 && ` · ${stats.due} due`}
          </p>
          {assignment && (
            <div>
              <AssignmentLine a={assignment} />
            </div>
          )}
          <EventBar stats={stats} color={color} className="mt-4" />
          <div className="mt-auto pt-4">
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
              <span
                className={cn(
                  'font-semibold',
                  complete ? 'text-success' : stats.due > 0 ? 'text-red dark:text-danger' : started ? 'text-ink' : 'text-muted',
                )}
              >
                {status}
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-(--ev)"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </Link>
      {onEdit && (
        <span className="absolute right-2 top-2" style={{ '--color-white': '#fff' } as CSSProperties}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${deck.title}`}
            className="text-white hover:bg-white/15"
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
        </span>
      )}
    </div>
  );
}

function AssignmentLine({ a }: { a: Assignment }) {
  if (!a.due_at) {
    return (
      <Badge tone="blue" className="mt-2 h-5 px-2 text-[10px]">
        Assigned
      </Badge>
    );
  }
  const due = new Date(a.due_at);
  const late = due.getTime() < Date.now();
  const soon = !late && due.getTime() - Date.now() < 2 * 86_400_000;
  return (
    <Badge tone={late || soon ? 'red' : 'blue'} className="mt-2 h-5 px-2 text-[10px]">
      {late ? 'Overdue' : 'Due'} {due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
    </Badge>
  );
}

function ChapterDecks({
  s,
  stats,
  staff,
  onNew,
  onEdit,
}: {
  s: VocabState;
  stats: Map<string, DeckStats>;
  staff: boolean;
  onNew: () => void;
  onEdit: (deck: Deck) => void;
}) {
  if (!s.chapterId) {
    return (
      <Card className="mt-6 flex flex-col items-start gap-3 rounded-[12px] border-blue bg-blue text-white sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white">Chapter decks</h3>
          <p className="text-sm text-white/85">Join your chapter to study the decks your trainers and executives make for you.</p>
        </div>
        <ButtonLink to="/chapter" variant="inverse" className="rounded-[8px]">
          Find my chapter
        </ButtonLink>
      </Card>
    );
  }
  const sorted = [...s.chapterDecks].sort((a, b) => {
    const aa = assignmentFor(s, a.deck?.id);
    const ab = assignmentFor(s, b.deck?.id);
    if (!!aa !== !!ab) return aa ? -1 : 1;
    return 0;
  });
  return (
    <Section
      title="Chapter decks"
      description="Made by your chapter's trainers and executives"
      action={
        staff ? (
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={onNew}>
            New deck
          </Button>
        ) : undefined
      }
      className="mt-8"
    >
      {s.chapterError ? (
        <ErrorState title="Chapter decks didn't load" error={s.chapterError} onRetry={reloadVocab} />
      ) : sorted.length === 0 ? (
        <EmptyState
          compact
          className="rounded-[12px] border-solid border-blue bg-blue text-white [&_h3]:text-white [&_p]:text-white/85"
          title="No chapter decks yet"
          description={
            staff
              ? 'Build a deck for this week\'s meeting. Paste a list straight from a spreadsheet.'
              : 'When your trainers make a deck, it shows up here.'
          }
          action={
            staff ? (
              <Button variant="inverse" className="rounded-[8px]" leftIcon={<Plus className="size-4" />} onClick={onNew}>
                Create a deck
              </Button>
            ) : (
              <ButtonLink to="/chapter" variant="inverse" className="rounded-[8px]">
                Go to my chapter
              </ButtonLink>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {sorted.map((d) => (
            <DeckTile
              key={d.key}
              deck={d}
              stats={stats.get(d.key)!}
              assignment={assignmentFor(s, d.deck?.id)}
              onEdit={d.deck && canManageDeck(s.scope, d.deck.event) ? () => onEdit(d.deck!) : undefined}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function SearchResults({
  query,
  decks,
  progress,
  onClear,
}: {
  query: string;
  decks: StudyDeck[];
  progress: ReadonlyMap<string, ProgressLike>;
  onClear: () => void;
}) {
  const [limit, setLimit] = useState(40);
  const deckBy = useMemo(() => new Map(decks.map((d) => [d.key, d])), [decks]);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored: { t: VocabTerm; score: number }[] = [];
    for (const d of decks)
      for (const t of d.terms) {
        const term = t.term.toLowerCase();
        const score = term === q ? 0 : term.startsWith(q) ? 1 : term.includes(q) ? 2 : t.def.toLowerCase().includes(q) ? 3 : -1;
        if (score >= 0) scored.push({ t, score });
      }
    return scored.sort((a, b) => a.score - b.score || a.t.term.localeCompare(b.t.term)).map((x) => x.t);
  }, [query, decks]);

  if (!hits.length) {
    return (
      <EmptyState
        className="mt-6"
        title={`No terms match "${query.trim()}"`}
        description="Try a shorter word, or search part of a definition."
        action={
          <Button variant="outline" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm text-muted" aria-live="polite">
        <span className="tabular font-semibold text-ink">{hits.length}</span> {hits.length === 1 ? 'match' : 'matches'}
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
        {hits.slice(0, limit).map((t) => {
          const d = deckBy.get(t.deckKey);
          const p = progress.get(t.id);
          return (
            <li key={t.id}>
              <Link
                to={`/vocab/${t.deckKey}?mode=terms&q=${encodeURIComponent(t.term)}`}
                className="group grid gap-1 px-4 py-3.5 transition-colors hover:bg-surface-2/70 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:gap-5"
              >
                <div className="font-display font-bold leading-snug text-heading">
                  <Highlight text={t.term} query={query} />
                </div>
                <p className="text-sm leading-relaxed text-ink">
                  <Highlight text={t.def} query={query} />
                </p>
                <div className="mt-1 flex items-center gap-2 sm:mt-0 sm:flex-col sm:items-end sm:gap-1">
                  {d && (
                    <span
                      className="inline-flex h-5 items-center rounded-[2px] px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
                      style={{ background: deckColor(d) }}
                      title={d.title}
                    >
                      {d.short}
                    </span>
                  )}
                  <StatusChip status={statusOf(p)} />
                  {p && isDue(p) && <span className="text-[11px] font-semibold text-red dark:text-danger">Due</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {hits.length > limit && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((n) => n + 60)}>
            Show more ({hits.length - limit} left)
          </Button>
        </div>
      )}
    </div>
  );
}
