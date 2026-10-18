import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, type TabItem } from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { EVENT_GROUPS } from '../../lib/types';
import { canManageDeck, eventName, type StudyDeck } from '../../api/vocab';
import { deckStats, isDue, relativeDue } from './leitner';
import { assignmentFor, findDeck, reloadVocab, useVocab } from './store';
import { DeckMark, EventBar, VocabStyles, deckColor, deckVars } from './parts';
import { Learn } from './Learn';
import { Flashcards } from './Flashcards';
import { Match } from './Match';
import { Quiz } from './Quiz';
import { TermList } from './TermList';
import { DeckEditor } from './DeckEditor';

type Mode = 'learn' | 'cards' | 'match' | 'quiz' | 'terms';
const MODES: Mode[] = ['learn', 'cards', 'match', 'quiz', 'terms'];
const REVIEW_KEY = 'review';

export default function DeckPage() {
  const { event: key = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { user, profile } = useAuth();
  const s = useVocab(user?.id, profile?.chapter_id);
  const [editing, setEditing] = useState(false);

  const raw = params.get('mode') as Mode | null;
  const mode: Mode = raw && MODES.includes(raw) ? raw : 'learn';
  const setMode = (m: Mode) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('mode', m);
        n.delete('q');
        return n;
      },
      { replace: true },
    );

  // "Due today" across every deck. Snapshotted once per visit so the session doesn't reshuffle as terms are cleared.
  const reviewSnap = useRef<StudyDeck | null>(null);
  if (key === REVIEW_KEY && !reviewSnap.current && s.status === 'ready') {
    const terms = [...s.chapterDecks, ...s.eventDecks].flatMap((d) => d.terms.filter((t) => isDue(s.progress.get(t.id))));
    reviewSnap.current = {
      key: REVIEW_KEY,
      kind: 'event',
      title: 'Due today',
      short: 'ALL',
      event: null,
      group: null,
      isNew: false,
      gradeNote: null,
      terms,
    };
  }
  useEffect(() => {
    if (key !== REVIEW_KEY) reviewSnap.current = null;
  }, [key]);

  const deck = key === REVIEW_KEY ? (reviewSnap.current ?? undefined) : findDeck(s, key);
  const stats = useMemo(
    () => (deck ? deckStats(deck.terms.map((t) => t.id), s.progress) : null),
    [deck, s.progress],
  );

  useEffect(() => {
    if (deck) document.title = `${deck.title} vocab | FBLA United`;
  }, [deck]);

  const loading = s.status === 'idle' || s.status === 'loading';

  if (!deck || !stats) {
    if (loading) return <LoadingDeck />;
    if (s.status === 'error') {
      return (
        <>
          <PageHeader title="Vocab" back={{ to: '/vocab', label: 'All decks' }} size="sm" />
          <Page>
            <ErrorState title="This deck didn't load" error={s.error} onRetry={reloadVocab} />
          </Page>
        </>
      );
    }
    return (
      <>
        <PageHeader title="Deck not found" back={{ to: '/vocab', label: 'All decks' }} size="sm" />
        <Page>
          <EmptyState
            title="We couldn't find that deck"
            description="It may have been deleted, or it belongs to a chapter you're not in."
            action={<ButtonLink to="/vocab">Browse all decks</ButtonLink>}
          />
        </Page>
      </>
    );
  }

  const assignment = deck.kind === 'chapter' ? assignmentFor(s, deck.deck?.id) : undefined;
  const canEdit = deck.kind === 'chapter' && !!deck.deck && canManageDeck(s.scope, deck.deck.event);
  const n = deck.terms.length;
  const group = deck.group ? EVENT_GROUPS.find((g) => g.id === deck.group)?.label : null;
  const eyebrow =
    key === REVIEW_KEY ? 'Review' : deck.kind === 'chapter' ? `Chapter deck${deck.event ? ` · ${eventName(deck.event)}` : ''}` : group;

  const tabs: TabItem<Mode>[] = [
    { value: 'learn', label: 'Learn', count: stats.due || undefined },
    { value: 'cards', label: 'Flashcards' },
    { value: 'match', label: 'Match', disabled: n < 3 },
    { value: 'quiz', label: 'Quiz', disabled: n < 4 },
    { value: 'terms', label: 'Terms', count: n },
  ];
  const active = tabs.find((t) => t.value === mode)?.disabled ? 'learn' : mode;

  let body: ReactNode;
  if (n === 0) {
    body = (
      <EmptyState
        className="rounded-[12px]"
        title={key === REVIEW_KEY ? 'Nothing is due' : 'This deck has no cards yet'}
        description={key === REVIEW_KEY ? 'You are all caught up. Pick a deck to learn something new.' : 'Cards added by your chapter staff will show up here.'}
        action={<ButtonLink to="/vocab">Browse decks</ButtonLink>}
      />
    );
  } else if (active === 'learn') body = <Learn deck={deck} progress={s.progress} />;
  else if (active === 'cards') body = <Flashcards deck={deck} progress={s.progress} />;
  else if (active === 'match') body = <Match deck={deck} />;
  else if (active === 'quiz') body = <Quiz deck={deck} />;
  else body = <TermList deck={deck} progress={s.progress} initialQuery={params.get('q') ?? ''} />;

  const color = deckColor(deck);

  return (
    <div style={deckVars(color)}>
      <VocabStyles />
      <div className="h-1.5" style={{ background: color }} aria-hidden />
      <PageHeader
        eyebrow={
          eyebrow || deck.short ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {eyebrow}
              {deck.key !== REVIEW_KEY && (
                <span
                  className="inline-flex h-5 items-center rounded-[2px] px-1.5 text-[10px] font-bold tracking-[0.1em]"
                  style={{ background: color, color: '#fff' }}
                >
                  {deck.short}
                </span>
              )}
              {deck.isNew && <span style={{ color }}>*NEW</span>}
            </span>
          ) : undefined
        }
        title={deck.title}
        back={{ to: '/vocab', label: 'All decks' }}
        leading={
          <DeckMark deck={deck} size={64} className="max-sm:!size-12" />
        }
        subtitle={
          assignment ? (
            <>
              Assigned
              {assignment.due_at
                ? `, due ${new Date(assignment.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
                : ''}
              {assignment.instructions ? `. ${assignment.instructions}` : ''}
            </>
          ) : deck.kind === 'event' && key !== REVIEW_KEY ? (
            `${n} terms that come up on the ${deck.title} test.`
          ) : key === REVIEW_KEY ? (
            `${n} ${n === 1 ? 'term' : 'terms'} from all your decks are ready for review.`
          ) : (
            `${n} cards from your chapter.`
          )
        }
        actions={
          <>
            {canEdit && (
              <Button variant="inverse" leftIcon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit deck
              </Button>
            )}
            {deck.kind === 'event' && deck.event && key !== REVIEW_KEY && (
              <ButtonLink to={`/play/${deck.event}`} variant="inverse">
                Practice questions
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
          <HeaderCount label="mastered" value={stats.mastered} dot="bg-success" />
          <HeaderCount label="reviewing" value={stats.review} dot="bg-[#7FA3DD]" />
          <HeaderCount label="learning" value={stats.learning} dot="bg-warning" />
          <HeaderCount label="new" value={stats.fresh} dot="bg-white/40" />
          <span className="tabular font-semibold text-white">
            {stats.due > 0 ? `${stats.due} due today` : stats.nextDue ? `Next review ${relativeDue(stats.nextDue)}` : ''}
          </span>
        </div>
        <div className="mt-4 flex max-w-xl items-center gap-3">
          <EventBar stats={stats} color={color} className="flex-1" />
          <span className="tabular shrink-0 text-xs font-semibold text-muted">
            {stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0}% mastered
          </span>
        </div>
      </PageHeader>

      <Page>
        <Tabs<Mode>
          id="vocab-mode"
          aria-label="Study mode"
          items={tabs}
          value={active}
          onChange={setMode}
          className="mb-6 [&_[aria-selected=true]]:after:bg-(--ev) [&_[aria-selected=true]>span]:bg-(--ev)"
        />
        <div key={`${deck.key}-${active}`} id={`vocab-mode-panel-${active}`} role="tabpanel" aria-labelledby={`vocab-mode-tab-${active}`}>
          {body}
        </div>
      </Page>

      {canEdit && profile?.chapter_id && s.scope && (
        <DeckEditor
          open={editing}
          onClose={() => setEditing(false)}
          chapterId={profile.chapter_id}
          scope={s.scope}
          deck={deck.deck}
        />
      )}
    </div>
  );
}

function HeaderCount({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      <span className="tabular font-semibold text-white">{value}</span> {label}
    </span>
  );
}

function LoadingDeck() {
  return (
    <>
      <PageHeader title={<span className="inline-block h-9 w-56 animate-pulse rounded-[2px] bg-white/15" />} back={{ to: '/vocab', label: 'All decks' }} />
      <Page>
        <Skeleton className="mb-6 h-11 w-full max-w-lg" />
        <Skeleton className="mx-auto h-80 w-full max-w-2xl" rounded="rounded-[12px]" />
      </Page>
    </>
  );
}
