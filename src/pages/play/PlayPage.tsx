import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  Badge,
  ButtonLink,
  Card,
  EloBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  SkeletonCards,
  cn,
} from '../../components/ui';
import { Page, Section } from '../../components/layout/Page';
import { useProfile } from '../../lib/auth';
import { loadIndex, type Topic } from '../../lib/content';
import { EVENTS, EVENT_GROUPS, eventInfo, eventName } from '../../lib/types';
import {
  bestEndless,
  dailyStreak,
  listMyAssignments,
  loadPlayHistory,
  openMisses,
  summariseAreas,
  summariseEvents,
  todaysDaily,
  type MyAssignment,
  type PlayHistory,
} from '../../api/play';
import { AccuracyRing, AreaPickerModal, AttemptList, EventPickerModal, EventTitle, MockPickerModal, pctText, useUntilReset } from './parts';
import { DAILY_SIZE, runHref } from './runLogic';

const FOCUS_KEY = 'kcbfbla:play:focus';

type Data = { history: PlayHistory; topics: Topic[]; assignments: MyAssignment[] | null };

export default function PlayPage() {
  const profile = useProfile();
  const { hash } = useLocation();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [focus, setFocusState] = useState<string>(() => {
    try {
      const v = localStorage.getItem(FOCUS_KEY);
      if (v !== null && (v === '' || eventInfo(v))) return v;
    } catch {
      /* ignore */
    }
    return eventInfo(profile.main_event) ? profile.main_event! : '';
  });
  const setFocus = (v: string) => {
    setFocusState(v);
    try {
      localStorage.setItem(FOCUS_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [picker, setPicker] = useState<null | 'area' | 'mock'>(null);
  const [modal, setModal] = useState<null | 'area' | 'mock'>(null);
  const [pickedEvent, setPickedEvent] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    Promise.all([
      loadPlayHistory(),
      loadIndex(),
      profile.chapter_id ? listMyAssignments(profile.chapter_id).catch(() => [] as MyAssignment[]) : Promise.resolve(null),
    ])
      .then(([history, topics, assignments]) => setData({ history, topics, assignments }))
      .catch(setError);
  }, [profile.chapter_id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (data && hash === '#assigned') document.getElementById('assigned')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data, hash]);

  const summary = useMemo(() => (data ? summariseEvents(data.history) : null), [data]);
  const seenByEvent = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of data?.history.log ?? []) {
      const s = m.get(a.topic) ?? new Set<string>();
      s.add(a.qid);
      m.set(a.topic, s);
    }
    return m;
  }, [data]);

  const answered = profile.questions_answered;
  const acc = answered ? profile.questions_correct / answered : 0;

  const startNeedsEvent = (what: 'area' | 'mock') => {
    if (focus) {
      setPickedEvent(focus);
      setModal(what);
    } else setPicker(what);
  };

  const topicFor = (slug: string | null) => data?.topics.find((t) => t.slug === slug);

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Play"
        subtitle="Official-style questions for all 15 events. Every answer moves your Elo, harder questions move it more."
        actions={<EloBadge elo={profile.elo} size="lg" onDark />}
      >
        <div className="flex flex-wrap gap-2">
          <HeaderChip label="Answered" value={answered.toLocaleString()} />
          <HeaderChip label="Accuracy" value={answered ? pctText(acc) : '--'} />
          <HeaderChip label="Day streak" value={String(profile.current_streak ?? 0)} />
          <HeaderChip label="Best answer streak" value={String(profile.best_answer_streak ?? 0)} />
        </div>
      </PageHeader>

      <Page>
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !data || !summary ? (
          <LoadingPlay />
        ) : (
          <>
            <DailyCard history={data.history} />

            <Section
              title="Modes"
              description={focus ? `Focused on ${eventName(focus)}` : 'Mixed across every event'}
              action={
                <Select
                  aria-label="Focus event"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  className="w-44 sm:w-64"
                  options={[
                    { value: '', label: 'All events (mixed)' },
                    ...EVENTS.map((e) => ({ value: e.slug, label: e.name })),
                  ]}
                />
              }
            >
              <ModeGrid
                focus={focus}
                history={data.history}
                assignments={data.assignments}
                onArea={() => startNeedsEvent('area')}
                onMock={() => startNeedsEvent('mock')}
              />
            </Section>

            <Assigned assignments={data.assignments} />

            {EVENT_GROUPS.map((g) => (
              <Section key={g.id} title={g.label} description={g.blurb}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {EVENTS.filter((e) => e.group === g.id).map((e) => {
                    const s = summary.get(e.slug);
                    const t = topicFor(e.slug);
                    const seen = seenByEvent.get(e.slug)?.size ?? 0;
                    const mine = profile.main_event === e.slug;
                    return (
                      <Link key={e.slug} to={`/play/${e.slug}`} className="group block rounded-[4px] focus-visible:outline-offset-4">
                        <Card interactive className={cn('flex h-full flex-col p-4', mine && 'border-red/40')}>
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <span className="font-display text-[11px] font-bold tracking-wider text-muted">{e.short}</span>
                                {mine && (
                                  <Badge tone="red" className="h-5 px-2 text-[10px]">
                                    Your event
                                  </Badge>
                                )}
                              </div>
                              <h3 className="text-[1.05rem] font-bold leading-snug">
                                <EventTitle e={e} />
                              </h3>
                              {e.gradeNote && <p className="mt-0.5 text-xs font-semibold text-warning">{e.gradeNote}</p>}
                            </div>
                            <AccuracyRing accuracy={s?.accuracy ?? 0} answered={s?.answered ?? 0} />
                          </div>
                          <div className="mt-auto pt-4">
                            <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                              <span className="tabular">
                                {s?.attempts ? `${s.attempts} ${s.attempts === 1 ? 'attempt' : 'attempts'}` : 'No attempts yet'}
                                {s?.answered ? ` / ${s.answered} answered` : ''}
                              </span>
                              <span className="tabular">
                                {seen}/{t?.questions ?? 100} seen
                              </span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-none bg-surface-3">
                              <div
                                className="h-full bg-blue transition-[width] duration-500 group-hover:bg-navy dark:group-hover:bg-link"
                                style={{ width: `${(seen / (t?.questions || 100)) * 100}%` }}
                              />
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </Section>
            ))}

            <Section
              title="Recent attempts"
              action={
                data.history.attempts.length > 0 ? (
                  <Link to="/me/career" className="link text-sm">
                    All in Career
                  </Link>
                ) : undefined
              }
            >
              {data.history.attempts.length ? (
                <AttemptList attempts={data.history.attempts.slice(0, 6)} showEvent />
              ) : (
                <EmptyState
                  compact
                  title="No attempts yet"
                  description="Your first Quick 10 takes about five minutes. Every answer moves your Elo."
                  action={
                    <ButtonLink to={runHref({ mode: 'quick', event: focus || null })} variant="accent">
                      Start a Quick 10
                    </ButtonLink>
                  }
                />
              )}
            </Section>
          </>
        )}
      </Page>

      <EventPickerModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === 'mock' ? 'Mock exam: pick an event' : 'Area drill: pick an event'}
        grade={profile.grade}
        onPick={(slug) => {
          const what = picker;
          setPicker(null);
          setPickedEvent(slug);
          if (what) setModal(what);
        }}
      />
      <AreaPickerModal
        open={modal === 'area'}
        onClose={() => setModal(null)}
        event={pickedEvent}
        subs={topicFor(pickedEvent)?.subs ?? []}
        areas={data && pickedEvent ? summariseAreas(data.history, pickedEvent) : new Map()}
      />
      <MockPickerModal open={modal === 'mock'} onClose={() => setModal(null)} event={pickedEvent} />
    </>
  );
}

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-white/20 px-3 text-sm text-white">
      <span className="text-white/70">{label}</span>
      <span className="tabular font-display font-bold">{value}</span>
    </span>
  );
}

function DailyCard({ history }: { history: PlayHistory }) {
  const done = todaysDaily(history);
  const streak = dailyStreak(history);
  const until = useUntilReset();
  return (
    <div className="relative mb-8 overflow-hidden rounded-[4px] border border-line bg-surface">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-red" aria-hidden />
      <div className="flex flex-col gap-4 p-5 pl-6 md:flex-row md:items-center md:gap-6 md:p-6 md:pl-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-red dark:text-danger">
              {DAILY_SIZE} questions · same for everyone
            </span>
            {streak > 1 && <Badge tone="warning">{streak}-day daily streak</Badge>}
            {done && <Badge tone="success">Done today</Badge>}
          </div>
          <h2 className="mt-1 text-xl font-extrabold">Daily challenge</h2>
          <p className="mt-1 text-sm text-muted">
            {done ? (
              <>
                You scored <b className="tabular text-heading">{done.correct}/{done.total}</b>
                {done.elo_after !== done.elo_before && (
                  <span className={cn('tabular font-semibold', done.elo_after > done.elo_before ? 'text-success' : 'text-red dark:text-danger')}>
                    {' '}({done.elo_after > done.elo_before ? '+' : ''}
                    {done.elo_after - done.elo_before} Elo)
                  </span>
                )}
                . A new set unlocks in <span className="tabular font-semibold text-heading">{until}</span>.
              </>
            ) : (
              <>
                {DAILY_SIZE} questions across the events, the same for every member today. One try, resets in{' '}
                <span className="tabular font-semibold text-heading">{until}</span>.
              </>
            )}
          </p>
        </div>
        {done ? (
          <ButtonLink to={`/play/review/${done.id}`} variant="outline" rightIcon={<ArrowRight className="size-4" />}>
            Review answers
          </ButtonLink>
        ) : (
          <ButtonLink to={runHref({ mode: 'daily' })} variant="accent" size="lg" rightIcon={<ArrowRight className="size-4" />}>
            Play today's set
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

function ModeGrid({
  focus,
  history,
  assignments,
  onArea,
  onMock,
}: {
  focus: string;
  history: PlayHistory;
  assignments: MyAssignment[] | null;
  onArea: () => void;
  onMock: () => void;
}) {
  const ev = focus || null;
  const best = bestEndless(history, ev);
  const misses = openMisses(history, ev).length;
  const open = assignments?.filter((a) => !a.done && a.kind !== 'deck').length ?? 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ModeCard
        accent="blue"
        title="Quick 10"
        text="Ten questions, new ones first. The fastest way to keep your streak alive."
        meta="10 questions · about 5 min"
        to={runHref({ mode: 'quick', event: ev })}
        cta="Play"
      />
      <ModeCard
        accent="red"
        title="Endless"
        text="Keep answering until your third miss. How long can your run go?"
        meta={best ? `Best run ${best.correct}` : 'No run yet'}
        to={runHref({ mode: 'endless', event: ev })}
        cta="Start a run"
      />
      <ModeCard
        accent="red"
        title="Weak spots"
        text="Your misses plus your lowest-scoring competency areas, in one set."
        meta={misses ? `${misses} open ${misses === 1 ? 'miss' : 'misses'}` : history.log.length ? 'No open misses' : 'Needs some history'}
        to={runHref({ mode: 'weak', event: ev })}
        cta="Target them"
        extra={
          misses > 0 ? (
            <Link to={runHref({ redo: 'wrong', event: ev })} className="link inline-flex items-center gap-1 text-sm">
              Redo just the misses <ArrowRight className="size-3.5" />
            </Link>
          ) : null
        }
      />
      <ModeCard
        accent="navy"
        title="Area drill"
        text="Pick one competency area and drill ten questions from it."
        meta={ev ? `10 questions · ${eventName(ev)}` : '10 questions · choose an event'}
        onClick={onArea}
        cta="Pick an area"
      />
      <ModeCard
        accent="navy"
        title="Mock exam"
        text="100 questions in 50 minutes, weighted like the real test. Results at the end."
        meta={ev ? `100 questions · ${eventName(ev)}` : '100 questions · 50 min'}
        onClick={onMock}
        cta="Set it up"
        badge={<Badge tone="navy">Official format</Badge>}
      />
      {assignments ? (
        <ModeCard
          accent="blue"
          title="Assigned"
          text="Tests and question sets your chapter leaders assigned to you."
          meta={open ? `${open} to do` : assignments.length ? 'All caught up' : 'Nothing assigned yet'}
          to="/play#assigned"
          cta={open ? 'See assignments' : 'View'}
          highlight={open > 0}
        />
      ) : (
        <ModeCard
          accent="blue"
          title="Assigned"
          text="Join your school's chapter to get tests and question sets from your leaders."
          meta="Not in a chapter"
          to="/chapter"
          cta="Find your chapter"
        />
      )}
    </div>
  );
}

const ACCENTS = {
  navy: 'bg-navy dark:bg-link',
  red: 'bg-red',
  blue: 'bg-blue',
};

function ModeCard({
  accent,
  title,
  text,
  meta,
  to,
  onClick,
  cta,
  extra,
  badge,
  highlight,
}: {
  accent: keyof typeof ACCENTS;
  title: string;
  text: string;
  meta: string;
  to?: string;
  onClick?: () => void;
  cta: string;
  extra?: ReactNode;
  badge?: ReactNode;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', ACCENTS[accent])} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold leading-tight">{title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {highlight && <span className="size-2 rounded-full bg-red" aria-label="Has work to do" />}
        </div>
      </div>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="tabular truncate text-xs font-bold uppercase tracking-wide text-heading">{meta}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-display text-sm font-bold text-blue transition-transform group-hover:translate-x-0.5 dark:text-link">
          {cta} <ArrowRight className="size-4" />
        </span>
      </div>
    </>
  );
  const cls =
    'group relative flex h-full w-full flex-col overflow-hidden rounded-[2px] border border-line bg-surface p-5 pt-6 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2';
  return (
    <div className="flex flex-col">
      {to ? (
        <Link to={to} className={cls}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {inner}
        </button>
      )}
      {extra && <div className="px-1 pt-2">{extra}</div>}
    </div>
  );
}

function Assigned({ assignments }: { assignments: MyAssignment[] | null }) {
  if (!assignments) return null;
  const items = assignments.filter((a) => a.kind !== 'deck');
  const decks = assignments.filter((a) => a.kind === 'deck' && !a.done).length;
  return (
    <section id="assigned" className="mt-8 scroll-mt-24">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Assigned to you</h2>
          <p className="mt-0.5 text-sm text-muted">From your chapter leaders. Your scores are shared with them.</p>
        </div>
        <Link to="/chapter/classroom" className="link shrink-0 text-sm">
          Classroom
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState
          compact
          title="No assignments right now"
          description="When a leader assigns a test or question set, it shows up here with its due date."
          action={
            decks > 0 ? (
              <ButtonLink to="/vocab" variant="outline">
                {decks} flashcard {decks === 1 ? 'deck' : 'decks'} in Vocab
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {items.map((a) => (
              <AssignmentRow key={a.id} a={a} />
            ))}
          </ul>
          {decks > 0 && (
            <p className="mt-3 text-sm text-muted">
              Plus {decks} flashcard {decks === 1 ? 'deck' : 'decks'} assigned in{' '}
              <Link to="/vocab" className="link">
                Vocab
              </Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}

function AssignmentRow({ a }: { a: MyAssignment }) {
  const due = a.due_at ? new Date(a.due_at) : null;
  const soon = due && !a.done && due.getTime() - Date.now() < 2 * 86400_000 && due.getTime() > Date.now();
  const size = a.kind === 'test' ? (a.questionCount != null ? `${a.questionCount} questions` : 'Chapter test') : '25 official questions';
  return (
    <li
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-[2px] border bg-surface p-4 pl-5 sm:flex-row sm:items-center',
        a.overdue ? 'border-red/40' : 'border-line',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', a.done ? 'bg-success' : a.overdue ? 'bg-red' : 'bg-navy dark:bg-link')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-heading">{a.title}</span>
          {a.done && <Badge tone="success">Done</Badge>}
          {a.event && <Badge tone="blue">{eventInfo(a.event)?.short ?? a.event}</Badge>}
          {a.overdue && <Badge tone="red">Overdue</Badge>}
          {soon && <Badge tone="warning">Due soon</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {size}
          {due && ` / due ${due.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
          {a.best && ` / best ${a.best.correct}/${a.best.total}`}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {a.best && (
          <ButtonLink to={`/play/review/${a.best.id}`} variant="ghost" size="sm">
            Review
          </ButtonLink>
        )}
        <ButtonLink to={runHref({ assignment: a.id })} variant={a.done ? 'outline' : 'accent'} size="sm">
          {a.done ? 'Retake' : 'Start'}
        </ButtonLink>
      </div>
    </li>
  );
}

function LoadingPlay() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-8 h-28 w-full" rounded="rounded-[4px]" />
      <Skeleton className="mb-4 h-6 w-32" />
      <SkeletonCards count={6} />
      <Skeleton className="mb-4 mt-8 h-6 w-48" />
      <SkeletonCards count={6} />
    </div>
  );
}
