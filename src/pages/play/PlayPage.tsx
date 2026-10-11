import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  Badge,
  ButtonLink,
  EloBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  SkeletonCards,
  cn,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { EventCrest, eventStyle } from '../../lib/eventStyle';
import { useProfile } from '../../lib/auth';
import { loadIndex, type Topic } from '../../lib/content';
import { EVENTS, EVENT_GROUPS, eventInfo, eventName, type EventInfo } from '../../lib/types';
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
import { AreaPickerModal, AttemptList, EventPickerModal, EventTitle, MockPickerModal, PlaySection, pctText, useUntilReset } from './parts';
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
        </div>
      </PageHeader>

      <Page className="md:py-12">
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !data || !summary ? (
          <LoadingPlay />
        ) : (
          <div className="space-y-14 md:space-y-20">
            <DailyCard history={data.history} />

            <PlaySection
              title="Practice modes"
              description={
                focus
                  ? `Focused on ${eventName(focus)}. Change the event to practise something else.`
                  : 'Mixed across every event. Pick one event to focus every mode on it.'
              }
              action={
                <Select
                  aria-label="Focus event"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  className="w-full sm:w-72"
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
            </PlaySection>

            <Assigned assignments={data.assignments} />

            {EVENT_GROUPS.map((g) => (
              <PlaySection key={g.id} title={g.label} description={g.blurb}>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                  {EVENTS.filter((e) => e.group === g.id).map((e) => (
                    <EventCard
                      key={e.slug}
                      e={e}
                      s={summary.get(e.slug)}
                      seen={seenByEvent.get(e.slug)?.size ?? 0}
                      total={topicFor(e.slug)?.questions || 100}
                      mine={profile.main_event === e.slug}
                    />
                  ))}
                </div>
              </PlaySection>
            ))}

            <PlaySection
              title="Recent attempts"
              description="Open any attempt to review every question and explanation."
              action={
                data.history.attempts.length > 0 ? (
                  <Link to="/me/career" className="link inline-flex items-center gap-1 text-sm font-semibold">
                    See all in Career <ArrowRight className="size-3.5" />
                  </Link>
                ) : undefined
              }
            >
              {data.history.attempts.length ? (
                <AttemptList attempts={data.history.attempts.slice(0, 4)} showEvent />
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
            </PlaySection>
          </div>
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
    <div className="relative overflow-hidden rounded-[12px] bg-navy text-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-red" aria-hidden />
      <div className="flex flex-col gap-6 px-6 pb-7 pt-8 md:flex-row md:items-center md:gap-10 md:px-10 md:pb-9 md:pt-10">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-white/75">
              Daily challenge
            </span>
            {streak > 1 && <Badge tone="warning" solid>{streak}-day daily streak</Badge>}
            {done && <Badge tone="success" solid>Done today</Badge>}
          </div>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {done ? "Today's set is done" : `Today's ${DAILY_SIZE} questions`}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-white/80">
            {done ? (
              <>
                You scored <b className="tabular text-white">{done.correct}/{done.total}</b>
                {done.elo_after !== done.elo_before && (
                  <span className={cn('tabular font-semibold', done.elo_after > done.elo_before ? 'text-[#7FD6A8]' : 'text-white/75')}>
                    {' '}({done.elo_after > done.elo_before ? '+' : ''}
                    {done.elo_after - done.elo_before} Elo)
                  </span>
                )}
                . A new set unlocks in <span className="tabular font-semibold text-white">{until}</span>.
              </>
            ) : (
              <>
                {DAILY_SIZE} questions across the events, the same for every member today. One try, resets in{' '}
                <span className="tabular font-semibold text-white">{until}</span>.
              </>
            )}
          </p>
        </div>
        {done ? (
          <ButtonLink
            to={`/play/review/${done.id}`}
            variant="inverse"
            size="lg"
            className="shrink-0 self-start md:self-center"
            rightIcon={<ArrowRight className="size-4" />}
          >
            Review answers
          </ButtonLink>
        ) : (
          <ButtonLink
            to={runHref({ mode: 'daily' })}
            variant="accent"
            size="lg"
            className="shrink-0 self-start md:self-center"
            rightIcon={<ArrowRight className="size-4" />}
          >
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
    <div>
      <div className="grid gap-5 md:grid-cols-3 lg:gap-6">
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
          title="Mock exam"
          text="100 questions in 50 minutes, weighted like the real test. Results at the end."
          meta={ev ? `100 questions · ${eventName(ev)}` : '100 questions · 50 min'}
          onClick={onMock}
          cta="Set it up"
          badge={<Badge tone="navy">Official format</Badge>}
        />
      </div>

      <div className="mt-10 text-xs font-bold uppercase tracking-[0.14em] text-muted">More ways to play</div>
      <div className="mt-4 grid gap-4 md:grid-cols-3 lg:gap-6">
        <ModeRowCard
          title="Endless"
          text="Keep answering until your third miss."
          meta={best ? `Best run ${best.correct}` : 'No run yet'}
          to={runHref({ mode: 'endless', event: ev })}
          cta="Start a run"
        />
        <ModeRowCard
          title="Area drill"
          text="Ten questions from one competency area."
          meta={ev ? eventInfo(ev)?.short ?? '' : 'Choose an event'}
          onClick={onArea}
          cta="Pick an area"
        />
        {assignments ? (
          <ModeRowCard
            title="Assigned"
            text="Tests and question sets from your chapter leaders."
            meta={open ? `${open} to do` : assignments.length ? 'All caught up' : 'Nothing yet'}
            to="/play#assigned"
            cta={open ? 'See assignments' : 'View'}
            highlight={open > 0}
          />
        ) : (
          <ModeRowCard
            title="Assigned"
            text="Join your school's chapter to get tests from your leaders."
            meta="Not in a chapter"
            to="/chapter"
            cta="Find your chapter"
          />
        )}
      </div>
    </div>
  );
}

const ACCENTS = {
  navy: 'bg-navy dark:bg-link',
  red: 'bg-red',
  blue: 'bg-blue',
};

/** Primary mode: big, roomy, one clear purpose. */
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
}) {
  const inner = (
    <>
      <span className={cn('absolute inset-x-0 top-0 h-1', ACCENTS[accent])} aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="font-display text-xl font-extrabold leading-tight md:text-[1.375rem]">{title}</h3>
        {badge}
      </div>
      <p className="mb-8 mt-3 text-[0.9375rem] leading-relaxed text-muted">{text}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-5">
        <span className="tabular truncate text-xs font-bold uppercase tracking-wide text-heading">{meta}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-display text-sm font-bold text-blue transition-transform group-hover:translate-x-0.5 dark:text-link">
          {cta} <ArrowRight className="size-4" />
        </span>
      </div>
    </>
  );
  const cls =
    'group relative flex w-full flex-1 flex-col overflow-hidden rounded-[12px] border border-line bg-surface p-6 pt-8 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 md:p-7 md:pt-9';
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
      {extra ? <div className="px-1 pt-3">{extra}</div> : <div className="hidden h-8 md:block" aria-hidden />}
    </div>
  );
}

/** Secondary mode: lighter, smaller, no accent bar. */
function ModeRowCard({
  title,
  text,
  meta,
  to,
  onClick,
  cta,
  highlight,
}: {
  title: string;
  text: string;
  meta: string;
  to?: string;
  onClick?: () => void;
  cta: string;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-base font-bold leading-tight">
          {title}
          {highlight && <span className="size-2 rounded-full bg-red" aria-label="Has work to do" />}
        </h3>
        <span className="tabular truncate text-xs font-semibold text-muted">{meta}</span>
      </div>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 font-display text-sm font-bold text-blue transition-transform group-hover:translate-x-0.5 dark:text-link">
        {cta} <ArrowRight className="size-3.5" />
      </span>
    </>
  );
  const cls =
    'group flex h-full w-full flex-col rounded-[12px] border border-line bg-surface-2/60 px-5 py-4 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Event card: solid event-colour strip with its crest and code, white body with progress in the event colour. */
function EventCard({
  e,
  s,
  seen,
  total,
  mine,
}: {
  e: EventInfo;
  s: { accuracy: number; answered: number; attempts: number } | undefined;
  seen: number;
  total: number;
  mine: boolean;
}) {
  const { color } = eventStyle(e.slug);
  return (
    <Link to={`/play/${e.slug}`} className="group block rounded-[12px] focus-visible:outline-offset-4">
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-[12px] border bg-surface transition-[transform,border-color] duration-200 ease-out hover:-translate-y-px hover:border-line-strong',
          mine ? 'border-red/50' : 'border-line',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-5" style={{ backgroundColor: color }}>
          <EventCrest slug={e.slug} size={44} className="max-sm:!size-9" />
          <div className="flex items-center gap-2">
            {mine && (
              <span className="rounded-[2px] border border-white/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Your event
              </span>
            )}
            <span className="rounded-[2px] bg-white px-2 py-0.5 font-display text-xs font-bold tracking-wider" style={{ color }}>
              {e.short}
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-4 sm:p-5">
          <h3 className="text-[1.0625rem] font-bold leading-snug">
            <EventTitle e={e} />
          </h3>
          {e.gradeNote && <p className="mt-1 text-xs font-semibold text-warning">{e.gradeNote}</p>}
          <div className="mt-auto pt-4 sm:pt-6">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="tabular text-sm font-semibold text-heading">
                {s?.answered ? `${pctText(s.accuracy)} accuracy` : 'Not started'}
              </span>
              <span className="tabular text-xs text-muted">
                {s?.attempts ? `${s.attempts} ${s.attempts === 1 ? 'attempt' : 'attempts'}` : 'No attempts yet'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden bg-surface-3">
              <div
                className="h-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, (seen / total) * 100)}%`, backgroundColor: color }}
              />
            </div>
            <div className="tabular mt-2 text-xs text-muted">
              {seen}/{total} questions seen
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Assigned({ assignments }: { assignments: MyAssignment[] | null }) {
  if (!assignments) return null;
  const items = assignments.filter((a) => a.kind !== 'deck');
  const decks = assignments.filter((a) => a.kind === 'deck' && !a.done).length;
  return (
    <PlaySection
      id="assigned"
      title="Assigned to you"
      description="From your chapter leaders. Your scores are shared with them."
      action={
        <Link to="/chapter/classroom" className="link inline-flex items-center gap-1 text-sm font-semibold">
          Classroom <ArrowRight className="size-3.5" />
        </Link>
      }
    >
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
          <ul className="grid gap-3">
            {items.map((a) => (
              <AssignmentRow key={a.id} a={a} />
            ))}
          </ul>
          {decks > 0 && (
            <p className="mt-5 text-sm text-muted">
              Plus {decks} flashcard {decks === 1 ? 'deck' : 'decks'} assigned in{' '}
              <Link to="/vocab" className="link">
                Vocab
              </Link>
              .
            </p>
          )}
        </>
      )}
    </PlaySection>
  );
}

function AssignmentRow({ a }: { a: MyAssignment }) {
  const due = a.due_at ? new Date(a.due_at) : null;
  const soon = due && !a.done && due.getTime() - Date.now() < 2 * 86400_000 && due.getTime() > Date.now();
  const size = a.kind === 'test' ? (a.questionCount != null ? `${a.questionCount} questions` : 'Chapter test') : '25 official questions';
  return (
    <li
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-[4px] border bg-surface px-6 py-5 sm:flex-row sm:items-center',
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
        <div className="mt-1 text-xs text-muted">
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
    <div role="status" aria-label="Loading" className="space-y-14 md:space-y-20">
      <Skeleton className="h-40 w-full" rounded="rounded-[12px]" />
      <div>
        <Skeleton className="mb-7 h-8 w-48" />
        <SkeletonCards count={3} />
      </div>
      <div>
        <Skeleton className="mb-7 h-8 w-64" />
        <SkeletonCards count={6} />
      </div>
    </div>
  );
}
