import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EloBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Skeleton,
  SkeletonCards,
  StatTile,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
} from '../../components/ui';
import { BarChart, LineChart, Sparkline } from '../../components/charts';
import { Page } from '../../components/layout/Page';
import { ATTEMPT_KIND_LABELS, ROLE_LABELS, eventInfo, eventName, isAdminRole, type AttendanceStatus } from '../../lib/types';
import { listAttempts, profileStats, weakSpots } from '../../api/core';
import { ATTENDANCE_LABELS, attendanceRate, getMyChapter, memberAttendance, relativeDay } from '../../api/chapter';
import { RoleBadge, accuracyTone, fmt, pct, useLoad } from './components/admin-shared';
import { officialOnlyNote } from '../me/parts';

const STATUS_DOT: Record<AttendanceStatus, string> = { present: 'bg-success', late: 'bg-warning', absent: 'bg-red', excused: 'bg-blue' };

function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export default function MemberPage() {
  const { userId = '' } = useParams();
  const viewer = useLoad(() => getMyChapter(), []);
  const stats = useLoad(() => profileStats(userId), [userId]);
  const canPrivate = stats.data?.can_view_private ?? false;
  const memberChapterId = stats.data?.chapter?.id ?? null;
  const viewerIsAdmin = !!viewer.data && isAdminRole(viewer.data.membership.role) && viewer.data.chapter.id === memberChapterId;
  const isSelf = viewer.data?.membership.user_id === userId;

  const weak = useLoad(() => (canPrivate ? weakSpots(userId) : Promise.resolve([])), [userId, canPrivate]);
  const attempts = useLoad(
    () => (canPrivate ? listAttempts({ userId, limit: 15 }) : Promise.resolve({ rows: [], count: 0 })),
    [userId, canPrivate],
  );
  // Attendance rows are readable only by the member and the chapter president/executives (RLS), so trainers
  // would otherwise get an empty list and read it as "no marks". Hide attendance from them instead.
  const canSeeAttendance = viewerIsAdmin || isSelf;
  const attendance = useLoad(
    () => (memberChapterId && canSeeAttendance ? memberAttendance(memberChapterId, userId) : Promise.resolve([])),
    [userId, memberChapterId, canSeeAttendance],
  );

  const weekly = useMemo(() => {
    const act = stats.data?.activity ?? [];
    const weeks = new Array(26).fill(0) as number[];
    const now = Date.now();
    for (const a of act) {
      const ago = Math.floor((now - new Date(`${a.date}T12:00:00`).getTime()) / (7 * 86_400_000));
      if (ago >= 0 && ago < 26) weeks[25 - ago] += a.answered;
    }
    return weeks;
  }, [stats.data]);

  if (stats.loading && !stats.data)
    return (
      <>
        <PageHeader
          back={{ to: '/chapter/admin', label: 'Admin' }}
          leading={<Skeleton className="size-20 bg-white/15" rounded="rounded-full" />
}
          title={<Skeleton className="h-10 w-56 bg-white/15" />}
        />
        <Page>
          <SkeletonCards count={4} />
        </Page>
      </>
    );
  if (stats.error)
    return (
      <>
        <PageHeader title="Member" back={{ to: '/chapter', label: 'Chapter' }} />
        <Page>
          <ErrorState error={stats.error} onRetry={() => void stats.reload()} />
        </Page>
      </>
    );
  const s = stats.data;
  if (!s)
    return (
      <>
        <PageHeader title="Member not found" back={{ to: '/chapter', label: 'Chapter' }} />
        <Page>
          <EmptyState title="This player doesn't exist" description="They may have deleted their account." action={<ButtonLink to="/chapter">Back to chapter</ButtonLink>} />
        </Page>
      </>
    );

  const p = s.profile;
  const back = viewerIsAdmin ? { to: '/chapter/admin', label: 'Admin' } : { to: '/chapter', label: 'Chapter' };

  if (!canPrivate)
    return (
      <>
        <PageHeader title={p.display_name} back={back} leading={<Avatar src={p.avatar_url} name={p.display_name} size="xl" ring />} />
        <Page>
          <EmptyState
            title="Chapter staff only"
            description={`Detailed stats and weak spots are visible to ${p.display_name}'s chapter president, executives and trainers.`}
            action={<ButtonLink to={`/u/${p.username}`}>View public profile</ButtonLink>}
          />
        </Page>
      </>
    );

  const att = attendance.data ?? [];
  const attRate = attendanceRate(att.map((r) => r.status));
  const eloSeries = s.elo_history.map((h) => ({ x: h.date, y: h.elo }));
  const last30 = s.activity.filter((a) => Date.now() - new Date(`${a.date}T12:00:00`).getTime() < 30 * 86_400_000).reduce((n, a) => n + a.answered, 0);

  return (
    <>
      <PageHeader
        back={back}
        leading={<Avatar src={p.avatar_url} name={p.display_name} size="xl" ring />}
        eyebrow={s.chapter ? `${ROLE_LABELS[s.chapter.role]} · ${s.chapter.name}` : 'No chapter'}
        title={p.display_name}
        subtitle={[`@${p.username}`, p.grade ? `Grade ${p.grade}` : null, p.main_event ? eventName(p.main_event) : null].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink to={`/u/${p.username}`} variant="inverse">
              Public profile
            </ButtonLink>
            {viewerIsAdmin && !isSelf && (
              <ButtonLink to="/chapter/admin" variant="accent">
                Manage
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <EloBadge elo={p.elo} size="lg" onDark />
          <span className="text-sm text-white/75">
            Peak <span className="tabular font-semibold text-white">{fmt(p.peak_elo)}</span> · Rank{' '}
            <span className="tabular font-semibold text-white">#{s.rank}</span> of {fmt(s.players)}
          </span>
        </div>
      </PageHeader>

      <Page>
        <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${canSeeAttendance ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
          <StatTile label="Accuracy" value={s.questions_answered ? pct(s.accuracy) : '–'} sub={`${fmt(s.questions_correct)}/${fmt(s.questions_answered)}`} />
          <StatTile label="Last 30 days" value={fmt(last30)} sub="questions" chart={<Sparkline values={weekly} title="Questions per week, last 26 weeks" />} />
          <StatTile label="Streak" value={`${s.current_streak}d`} sub={`best ${s.best_streak}d`} />
          <StatTile label="Time studied" value={fmtDuration(s.time_spent_ms)} sub={`${fmt(s.attempts_count)} ${s.attempts_count === 1 ? "set" : "sets"}`} />
          {canSeeAttendance && <StatTile label="Attendance" value={pct(attRate.rate)} sub={attRate.counted ? `${attRate.attended}/${attRate.counted} meetings` : 'No marks yet'} />}
          <StatTile label="Best set" value={s.best_paper ? pct(s.best_paper.accuracy) : '–'} sub={s.best_paper ? `${s.best_paper.correct}/${s.best_paper.total} correct` : 'no full set yet'} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <Card as="section">
              <CardHeader title="Elo over time" subtitle="Rating at the end of each day" />
              <LineChart title="Elo history" series={[{ name: 'Elo', data: eloSeries, color: 'var(--blue)' }]} height={200} area yMin={0} emptyLabel="No rated practice yet" />
            </Card>

            <Card as="section">
              <CardHeader
                title="Weak spots"
                subtitle="Accuracy by area on official questions, worst first. These are the areas to drill before competition."
              />
              {weak.loading && !weak.data ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : weak.error ? (
                <ErrorState error={weak.error} onRetry={() => void weak.reload()} />
              ) : !weak.data?.length ? (
                <p className="text-sm text-muted">No official questions answered yet.</p>
              ) : (
                <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                  {weak.data.slice(0, 12).map((w) => {
                    const tone = accuracyTone(w.accuracy);
                    return (
                      <li key={`${w.event}|${w.sub}`}>
                        <div className="mb-1 flex items-baseline gap-2">
                          <Badge className="h-5 shrink-0 px-1.5 text-[10px]">{eventInfo(w.event)?.short ?? w.event}</Badge>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={`${eventName(w.event)}: ${w.sub}`}>
                            {w.sub}
                          </span>
                          <span className="tabular text-sm font-bold" style={{ color: `var(--${tone === 'red' ? 'red' : tone === 'neutral' ? 'muted' : tone})` }}>
                            {pct(w.accuracy)}
                          </span>
                        </div>
                        <ProgressBar value={w.accuracy * 100} size="xs" tone={tone === 'neutral' ? 'blue' : tone} />
                        <div className="mt-1 text-xs text-muted">
                          {w.correct}/{w.answered} right · last {relativeDay(w.last_answered_at).toLowerCase()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card as="section">
              <CardHeader title="Accuracy by event" subtitle={officialOnlyNote(s)} />
              <BarChart
                title="Accuracy by event"
                data={s.by_event.map((e) => ({
                  label: eventName(e.event),
                  value: Math.round(e.accuracy * 1000) / 10,
                  sub: `${fmt(e.correct)}/${fmt(e.answered)} · +${fmt(e.elo)} Elo`,
                  color: e.accuracy >= 0.8 ? 'var(--success)' : e.accuracy >= 0.6 ? 'var(--warning)' : 'var(--red)',
                }))}
                max={100}
                formatValue={(v) => `${v}%`}
                emptyLabel="No events practised yet"
              />
            </Card>

            <Card as="section" padded={false} className="overflow-hidden">
              <div className="p-4 sm:p-5">
                <CardHeader
                  className="mb-0"
                  title="Recent attempts"
                  subtitle={attempts.data ? `${fmt(attempts.data.count)} in total` : undefined}
                />
              </div>
              {attempts.loading && !attempts.data ? (
                <div className="space-y-2 px-5 pb-5">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !attempts.data?.rows.length ? (
                <p className="px-5 pb-5 text-sm text-muted">No attempts yet.</p>
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>Set</TH>
                      <TH align="right">Score</TH>
                      <TH align="right" className="max-sm:hidden">Elo</TH>
                      <TH className="max-md:hidden">When</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {attempts.data.rows.map((a) => {
                      const acc = a.total ? a.correct / a.total : 0;
                      const d = a.elo_after - a.elo_before;
                      return (
                        <TR key={a.id}>
                          <TD>
                            <Link to={`/play/review/${a.id}`} className="block min-w-0 hover:underline">
                              <span className="block truncate text-sm font-semibold text-heading">{a.label || eventName(a.event)}</span>
                              <span className="block text-xs text-muted">
                                {ATTEMPT_KIND_LABELS[a.kind]}
                                {a.event && a.label ? ` · ${eventInfo(a.event)?.short ?? ''}` : ''}
                              </span>
                            </Link>
                          </TD>
                          <TD align="right" className="tabular text-sm">
                            <span className="font-semibold" style={{ color: `var(--${accuracyTone(acc) === 'red' ? 'red' : accuracyTone(acc)})` }}>
                              {a.correct}/{a.total}
                            </span>
                            <span className="ml-1.5 text-xs text-muted">{pct(acc)}</span>
                          </TD>
                          <TD align="right" className={cn('tabular max-sm:hidden text-sm font-semibold', d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-muted')}>
                            {d > 0 ? `+${d}` : d === 0 ? '0' : d}
                          </TD>
                          <TD className="max-md:hidden text-sm text-muted">{relativeDay(a.created_at)}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>

          <aside className="min-w-0 space-y-6">
            <Card as="section">
              <CardHeader title="Profile" />
              {p.bio && <p className="mb-4 whitespace-pre-line text-[0.9375rem]">{p.bio}</p>}
              <dl className="space-y-2.5 text-sm">
                {[
                  ['Role', s.chapter ? <RoleBadge role={s.chapter.role} /> : '–'],
                  ['School', p.school || '–'],
                  ['Grade', p.grade ? `Grade ${p.grade}` : '–'],
                  ['Main event', p.main_event ? eventName(p.main_event) : 'Not chosen'],
                  ['Last practised', relativeDay(p.last_active_date)],
                  ['Last seen', relativeDay(p.last_seen_at)],
                  ['Best answer streak', `${p.best_answer_streak} in a row`],
                  ['Arena', `${p.duel_wins}W ${p.duel_losses}L ${p.duel_draws}D`],
                  ['Joined FBLC', new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {canSeeAttendance && (
              <Card as="section">
                <CardHeader
                  title="Attendance"
                  subtitle={attRate.counted ? `${attRate.attended} of ${attRate.counted} counted meetings` : undefined}
                  action={<span className="tabular font-display text-2xl font-extrabold text-heading">{pct(attRate.rate)}</span>}
                />
                {attendance.loading && !attendance.data ? (
                  <Skeleton className="h-24 w-full" />
                ) : att.length === 0 ? (
                  <p className="text-sm text-muted">No meetings recorded yet.</p>
                ) : (
                  <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {att.map((r) => (
                      <li key={r.session.id} className="flex items-center gap-3 text-sm">
                        <span className={cn('size-2.5 shrink-0 rounded-full', r.status ? STATUS_DOT[r.status] : 'bg-line-strong')} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{r.session.title}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {new Date(`${r.session.held_on}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="w-[4.5rem] shrink-0 text-right text-xs font-semibold">{r.status ? ATTENDANCE_LABELS[r.status] : 'Not marked'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {p.main_event && (
              <Card as="section" className="flex items-center gap-3 border-l-4 border-l-navy">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-heading">{eventName(p.main_event)}</div>
                  <div className="text-xs text-muted">Their main event</div>
                </div>
                <ButtonLink to={`/play/${p.main_event}`} size="sm" variant="secondary">
                  Open
                </ButtonLink>
              </Card>
            )}
          </aside>
        </div>
      </Page>
    </>
  );
}
