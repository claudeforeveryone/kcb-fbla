import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Skeleton,
  SkeletonText,
  cn,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useProfile } from '../../lib/auth';
import { loadIndex, type Topic } from '../../lib/content';
import { readiness } from '../../lib/score';
import { EVENT_GROUPS, eventInfo } from '../../lib/types';
import { EventBlock, EventCrest } from '../../lib/eventStyle';
import {
  bestEndless,
  loadPlayHistory,
  openMisses,
  summariseAreas,
  summariseEvents,
  type PlayHistory,
} from '../../api/play';
import { AccuracyRing, AttemptList, EventTitle, PlaySection, accTone, pctText } from './parts';
import { runHref } from './runLogic';

export default function EventPage() {
  const { event = '' } = useParams();
  const info = eventInfo(event);
  const profile = useProfile();
  const [data, setData] = useState<{ history: PlayHistory; topic: Topic | null } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    Promise.all([loadPlayHistory(), loadIndex()])
      .then(([history, topics]) => setData({ history, topic: topics.find((t) => t.slug === event) ?? null }))
      .catch(setError);
  }, [event]);
  useEffect(() => {
    if (info) load();
  }, [info, load]);

  const stats = useMemo(() => {
    if (!data || !info) return null;
    const ev = summariseEvents(data.history).get(info.slug);
    const areas = summariseAreas(data.history, info.slug);
    const seen = new Set(data.history.log.filter((a) => a.topic === info.slug).map((a) => a.qid)).size;
    const ready = data.topic ? readiness(data.history.log, info.slug, data.topic.subs) : null;
    const misses = openMisses(data.history, info.slug).length;
    const best = bestEndless(data.history, info.slug);
    const attempts = data.history.attempts.filter((t) => t.event === info.slug);
    let weakest: string | null = null;
    for (const a of areas.values()) if (a.answered >= 3 && (!weakest || a.accuracy < areas.get(weakest)!.accuracy)) weakest = a.sub;
    return { ev, areas, seen, ready, misses, best, attempts, weakest };
  }, [data, info]);

  if (!info)
    return (
      <Page width="narrow">
        <EmptyState
          title="We don't know that event"
          description="It may have been renamed. Pick one from the full list."
          action={<ButtonLink to="/play">All events</ButtonLink>}
        />
      </Page>
    );

  const group = EVENT_GROUPS.find((g) => g.id === info.group);
  const ineligible = info.slug === 'intro-business-concepts' && profile.grade != null && profile.grade > 10;
  const total = data?.topic?.questions ?? 100;

  return (
    <>
      <PageHeader
        back={{ to: '/play', label: 'All events' }}
        leading={
          <EventBlock slug={info.slug} className="size-16 shrink-0 rounded-[12px] sm:size-[88px]">
            <span className="grid h-full place-items-center">
              <EventCrest slug={info.slug} size={54} className="max-sm:!size-10" />
            </span>
          </EventBlock>
        }
        eyebrow={`${group?.label ?? ''} / ${info.short}`}
        title={<EventTitle e={info} />}
        subtitle={
          info.gradeNote
            ? `${info.gradeNote}. ${group?.blurb ?? ''}`
            : group?.id === 'case'
              ? 'Case study event: the objective knowledge behind the case, area by area.'
              : group?.blurb
        }
        actions={
          <>
            <ButtonLink to={runHref({ mode: 'quick', event: info.slug })} variant="accent">
              Quick 10
            </ButtonLink>
            <ButtonLink to={runHref({ mode: 'mock', event: info.slug })} variant="inverse">
              Mock exam
            </ButtonLink>
          </>
        }
      >
        {stats && (
          <div className="flex flex-wrap gap-2">
            <Chip label="Accuracy" value={stats.ev?.answered ? pctText(stats.ev.accuracy) : '--'} />
            <Chip label="Answered" value={String(stats.ev?.answered ?? 0)} />
            <Chip label="Seen" value={`${stats.seen}/${total}`} />
            <Chip
              label="Elo from this event"
              value={`${(stats.ev?.eloDelta ?? 0) > 0 ? '+' : ''}${stats.ev?.eloDelta ?? 0}`}
            />
          </div>
        )}
      </PageHeader>

      <Page className="md:py-12">
        {ineligible && (
          <div className="mb-10 flex items-start gap-3 rounded-[4px] border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Introduction to Business Concepts is for grades 9 and 10 only. You can still practise it, but you
              can't compete in it in grade {profile.grade}.
            </span>
          </div>
        )}
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !data || !stats ? (
          <EventSkeleton />
        ) : (
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-14 lg:col-span-2">
              <Card className="p-6 md:p-7">
                <CardHeader
                  className="mb-5"
                  title="Competency areas"
                  subtitle="Your accuracy in each area of the official guide. Drill any area for 10 focused questions."
                />
                {data.topic?.subs.length ? (
                  <ul className="-mx-2 divide-y divide-line">
                    {data.topic.subs.map((s) => {
                      const a = stats.areas.get(s.name);
                      return (
                        <li key={s.name} className="flex items-center gap-4 px-2 py-4 sm:gap-5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-heading">{s.name}</span>
                              {stats.weakest === s.name && <Badge tone="red">Weakest</Badge>}
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <ProgressBar
                                className="flex-1"
                                size="sm"
                                value={a ? a.accuracy * 100 : 0}
                                tone={a ? accTone(a.accuracy) : 'blue'}
                              />
                              <span className="tabular shrink-0 text-right text-xs text-muted sm:w-28">
                                {a ? `${pctText(a.accuracy)} / ${a.correct} of ${a.answered}` : `Not tried / ${s.count} q`}
                              </span>
                            </div>
                          </div>
                          <ButtonLink
                            to={runHref({ mode: 'area', event: info.slug, area: s.name, n: 10 })}
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                            rightIcon={<ArrowRight className="size-3.5" />}
                          >
                            Drill
                          </ButtonLink>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Area breakdown isn't available for this event.</p>
                )}
              </Card>

              <PlaySection
                title="Past attempts"
                description="Open any attempt to review every question and explanation."
                action={
                  stats.attempts.length > 0 ? (
                    <Link to="/me/career" className="link inline-flex items-center gap-1 text-sm font-semibold">
                      See all in Career <ArrowRight className="size-3.5" />
                    </Link>
                  ) : undefined
                }
              >
                {stats.attempts.length ? (
                  <AttemptList attempts={stats.attempts.slice(0, 5)} />
                ) : (
                  <EmptyState
                    compact
                    title={`No ${info.name} attempts yet`}
                    description="Start with a Quick 10 to see where you stand in each area."
                    action={
                      <ButtonLink to={runHref({ mode: 'quick', event: info.slug })} variant="accent">
                        Start a Quick 10
                      </ButtonLink>
                    }
                  />
                )}
              </PlaySection>
            </div>

            <div className="space-y-8">
              <Card className="p-6">
                <CardHeader className="mb-5" title="Predicted score" subtitle="From your first tries, weighted by area." />
                {stats.ready?.ready ? (
                  <div className="flex items-center gap-4">
                    <AccuracyRing accuracy={stats.ready.score / 100} answered={1} size={84} />
                    <div>
                      <div className="tabular font-display text-3xl font-extrabold text-heading">
                        {stats.ready.score}
                        <span className="text-base text-muted">/100</span>
                      </div>
                      <div className="tabular text-sm text-muted">
                        likely {stats.ready.low} to {stats.ready.high}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <ProgressBar
                      value={stats.ready && !stats.ready.ready ? stats.ready.used : 0}
                      max={15}
                      size="sm"
                      label="First tries"
                      showValue={(v, m) => `${v}/${m}`}
                    />
                    <p className="mt-3 text-sm text-muted">
                      Answer {stats.ready && !stats.ready.ready ? stats.ready.need : 15} more new questions to unlock a
                      predicted test score.
                    </p>
                  </div>
                )}
              </Card>

              <Card padded={false} className="overflow-hidden">
                <div className="px-6 pb-3 pt-6">
                  <h3 className="text-base font-bold">Ways to practise</h3>
                </div>
                <ul className="divide-y divide-line">
                  <ModeRow
                    to={runHref({ mode: 'quick', event: info.slug })}
                    title="Quick 10"
                    sub="New questions first"
                  />
                  <ModeRow
                    to={runHref({ mode: 'practice', event: info.slug, n: 25 })}
                    title="Practice 25"
                    sub="A longer set with instant feedback"
                  />
                  <ModeRow
                    to={runHref({ mode: 'endless', event: info.slug })}
                    title="Endless"
                    sub={stats.best ? `Best run ${stats.best.correct}` : 'Three lives, no limit'}
                  />
                  <ModeRow
                    to={runHref({ mode: 'weak', event: info.slug })}
                    title="Weak spots"
                    sub={stats.weakest ? `Starts with ${stats.weakest}` : 'Your misses and lowest areas'}
                  />
                  {stats.misses > 0 && (
                    <ModeRow
                      to={runHref({ redo: 'wrong', event: info.slug })}
                      title="Redo missed"
                      sub={`${stats.misses} open ${stats.misses === 1 ? 'miss' : 'misses'}`}
                    />
                  )}
                  <ModeRow
                    to={runHref({ mode: 'mock', event: info.slug })}
                    title="Full mock exam"
                    sub="100 questions / 50 minutes"
                  />
                  <ModeRow
                    to={runHref({ mode: 'mock', event: info.slug, n: 50 })}
                    title="Half mock"
                    sub="50 questions / 25 minutes"
                  />
                </ul>
              </Card>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-white/20 px-3 text-sm text-white">
      <span className="text-white/70">{label}</span>
      <span className="tabular font-display font-bold">{value}</span>
    </span>
  );
}

function ModeRow({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-surface-2/70">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-heading">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        <ArrowRight className={cn('size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-blue')} />
      </Link>
    </li>
  );
}

function EventSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-3 lg:gap-8" role="status" aria-label="Loading">
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-[4px] border border-line bg-surface p-5">
          <Skeleton className="h-5 w-48" />
          <div className="mt-5 space-y-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-1.5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div className="rounded-[4px] border border-line bg-surface p-5">
          <SkeletonText lines={3} />
        </div>
        <div className="rounded-[4px] border border-line bg-surface p-5">
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
