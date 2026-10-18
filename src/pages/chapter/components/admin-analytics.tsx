// Admin > Analytics: chapter-wide accuracy, weakest areas, activity, inactivity and Elo spread.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EloBadge,
  EmptyState,
  ErrorState,
  ProgressBar,
  SkeletonCards,
  StatTile,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../../components/ui';
import { BarChart, LineChart } from '../../../components/charts';
import { eventInfo, eventName } from '../../../lib/types';
import { chapterAnalytics, daysSince, relativeDay, type AnalyticsMember } from '../../../api/chapter';
import { accuracyTone, fmt, pct, useLoad } from './admin-shared';

/** Members per numeric Elo range (0-99, 100-199, ...); wider ranges once scores climb high. */
function eloBuckets(elos: number[]) {
  const max = Math.max(0, ...elos.map((e) => Math.max(0, Math.round(e || 0))));
  const step = max < 1000 ? 100 : max < 2500 ? 250 : 500;
  const count = Math.max(3, Math.floor(max / step) + 1);
  const out = Array.from({ length: count }, (_, i) => ({
    label: `${i * step}-${(i + 1) * step - 1}`,
    value: 0,
    color: 'var(--blue)',
  }));
  for (const e of elos) out[Math.min(count - 1, Math.floor(Math.max(0, Math.round(e || 0)) / step))].value++;
  return out;
}

type SortKey =
 'name' | 'elo' | 'accuracy' | 'week' | 'streak' | 'attendance' | 'last';

export function AnalyticsPanel({ chapterId }: { chapterId: string }) {
  const a = useLoad(() => chapterAnalytics(chapterId), [chapterId]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'elo', dir: 'desc' });

  const daily = useMemo(() => {
    if (!a.data) return [];
    const map = new Map(a.data.daily.map((d) => [d.date, d]));
    const out: { x: string; answered: number; active: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ x: iso, answered: map.get(iso)?.answered ?? 0, active: map.get(iso)?.active ?? 0 });
    }
    return out;
  }, [a.data]);

  const sorted = useMemo(() => {
    const list = [...(a.data?.members ?? [])];
    const v = (m: AnalyticsMember): number | string => {
      switch (sort.key) {
        case 'name':
          return m.display_name.toLowerCase();
        case 'elo':
          return m.elo;
        case 'accuracy':
          return m.accuracy ?? -1;
        case 'week':
          return m.answered_7d;
        case 'streak':
          return m.current_streak;
        case 'attendance':
          return m.attendance_rate ?? -1;
        case 'last':
          return m.last_answer_at ? new Date(m.last_answer_at).getTime() : 0;
      }
    };
    return list.sort((x, y) => {
      const p = v(x);
      const q = v(y);
      const c = p < q ? -1 : p > q ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [a.data, sort]);

  if (a.loading && !a.data) return <SkeletonCards count={6} />;
  if (a.error || !a.data) return <ErrorState error={a.error} onRetry={() => void a.reload()} />;

  const { summary, members, by_event, by_sub } = a.data;
  const weekAcc = summary.answered_7d ? summary.correct_7d / summary.answered_7d : null;
  const allAcc = summary.questions_answered ? summary.questions_correct / summary.questions_answered : null;
  const enough = by_sub.filter((s) => s.answered >= 5);
  const weakest = (enough.length ? enough : by_sub).slice(0, 8);
  const mostActive = [...members].filter((m) => m.answered_7d > 0).sort((x, y) => y.answered_7d - x.answered_7d).slice(0, 5);
  const inactive = members
    .map((m) => ({ m, days: daysSince(m.last_answer_at) }))
    .filter((x) => x.days == null || x.days >= 7)
    .sort((x, y) => (y.days ?? 9999) - (x.days ?? 9999));
  const eloData = eloBuckets(members.map((m) => m.elo));

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const so = (key: SortKey) => (sort.key === key ? sort.dir : null);

  const nothingYet = summary.questions_answered === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
        <StatTile tone="navy" label="Members" value={fmt(summary.members)} sub={`${summary.active_7d} active this week`} />
        <StatTile label="Answered (7d)" value={fmt(summary.answered_7d)} sub={`${fmt(summary.questions_answered)} all time`} />
        <StatTile label="Accuracy (7d)" value={pct(weekAcc)} sub={`${pct(allAcc)} all time`} />
        <StatTile label="Avg Elo" value={fmt(summary.avg_elo)} sub={`${fmt(summary.total_elo)} total`} />
        <StatTile label="Inactive 7d+" value={fmt(inactive.length)} sub={summary.members ? pct(inactive.length / summary.members) + ' of chapter' : undefined} />
      </div>

      {nothingYet && (
        <EmptyState
          compact
          title="Waiting for the first answers"
          description="Analytics fill in as members practise. Share the classroom or assign a set to get things moving."
        />
      )}

      <Card as="section">
        <CardHeader title="Questions answered, last 30 days" subtitle="Official questions across the whole chapter" />
        <LineChart
          title="Questions answered per day"
          series={[{ name: 'Answered', data: daily.map((d) => ({ x: d.x, y: d.answered })) }]}
          height={200}
          area
          yMin={0}
          emptyLabel="No answers in the last 30 days"
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card as="section">
          <CardHeader title="Accuracy by event" subtitle="Every official answer from current members" />
          <BarChart
            title="Accuracy by event"
            data={by_event.map((e) => ({
              label: eventInfo(e.event)?.name ?? e.event,
              value: Math.round(e.accuracy * 1000) / 10,
              sub: `${fmt(e.correct)}/${fmt(e.answered)} · ${e.members} ${e.members === 1 ? 'member' : 'members'}`,
              color: e.accuracy >= 0.8 ? 'var(--success)' : e.accuracy >= 0.6 ? 'var(--warning)' : 'var(--red)',
            }))}
            max={100}
            formatValue={(v) => `${v}%`}
            emptyLabel="No answers yet"
          />
        </Card>

        <Card as="section">
          <CardHeader
            title="Weakest areas"
            subtitle={enough.length ? 'Lowest accuracy among areas with 5+ answers' : 'Lowest accuracy so far'}
          />
          {weakest.length === 0 ? (
            <p className="text-sm text-muted">Nothing to show yet.</p>
          ) : (
            <ul className="space-y-3.5">
              {weakest.map((s) => {
                const tone = accuracyTone(s.accuracy);
                return (
                  <li key={`${s.event}|${s.sub}`}>
                    <div className="mb-1 flex items-baseline gap-2">
                      <Badge className="h-5 shrink-0 px-1.5 text-[10px]">{eventInfo(s.event)?.short ?? s.event}</Badge>
                      <Link to={`/play/${s.event}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline" title={`${eventName(s.event)}: ${s.sub}`}>
                        {s.sub}
                      </Link>
                      <span className="tabular text-sm font-bold" style={{ color: `var(--${tone === 'red' ? 'red' : tone})` }}>
                        {pct(s.accuracy)}
                      </span>
                    </div>
                    <ProgressBar value={s.accuracy * 100} size="xs" tone={tone === 'neutral' ? 'blue' : tone} />
                    <div className="mt-1 text-xs text-muted">
                      {s.correct}/{s.answered} right · {s.members} {s.members === 1 ? 'member' : 'members'}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card as="section">
          <CardHeader title="Most active this week" />
          {mostActive.length === 0 ? (
            <p className="text-sm text-muted">No one has practised in the last 7 days.</p>
          ) : (
            <ol className="space-y-2.5">
              {mostActive.map((m, i) => (
                <li key={m.user_id}>
                  <Link to={`/chapter/member/${m.user_id}`} className="flex items-center gap-3 rounded-none p-1 hover:bg-surface-2">
                    <span className="tabular w-4 text-center font-display text-sm font-bold text-muted">{i + 1}</span>
                    <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-heading">{m.display_name}</span>
                      <span className="block text-xs text-muted">
                        {m.sets_7d} {m.sets_7d === 1 ? 'set' : 'sets'} · {pct(m.answered_7d ? m.correct_7d / m.answered_7d : null)} right
                      </span>
                    </span>
                    <span className="tabular text-sm font-bold">{fmt(m.answered_7d)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card as="section">
          <CardHeader
            title="Inactive 7+ days"
            subtitle={inactive.length ? 'A nudge goes a long way' : undefined}
            action={inactive.length ? <Badge tone="warning">{inactive.length}</Badge> : undefined}
          />
          {inactive.length === 0 ? (
            <p className="text-sm text-muted">Everyone has practised this week. Nice.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {inactive.map(({ m, days }) => (
                <li key={m.user_id}>
                  <Link to={`/chapter/member/${m.user_id}`} className="flex items-center gap-3 rounded-none p-1 hover:bg-surface-2">
                    <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">{m.display_name}</span>
                    <span className="shrink-0 text-xs font-semibold text-muted">{days == null ? 'Never practised' : `${days} days`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section">
          <CardHeader title="Elo spread" subtitle="Members per Elo range" />
          <BarChart title="Members per Elo range" orientation="vertical" data={eloData} height={190} formatValue={(v) => String(v)} />
        </Card>
      </div>

      <Card as="section" padded={false} className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <CardHeader className="mb-0" title="Member performance" subtitle="Click a column to sort. Open a member for weak spots and history." />
        </div>
        <Table>
          <THead>
            <tr>
              <TH sort={so('name')} onSort={() => toggle('name')}>Member</TH>
              <TH align="right" sort={so('elo')} onSort={() => toggle('elo')}>Elo</TH>
              <TH align="right" sort={so('accuracy')} onSort={() => toggle('accuracy')}>Accuracy</TH>
              <TH align="right" className="max-sm:hidden" sort={so('week')} onSort={() => toggle('week')}>This week</TH>
              <TH align="right" className="max-md:hidden" sort={so('streak')} onSort={() => toggle('streak')}>Streak</TH>
              <TH align="right" className="max-md:hidden" sort={so('attendance')} onSort={() => toggle('attendance')}>Attendance</TH>
              <TH className="max-lg:hidden" sort={so('last')} onSort={() => toggle('last')}>Last answer</TH>
            </tr>
          </THead>
          <TBody>
            {sorted.map((m) => (
              <TR key={m.user_id}>
                <TD>
                  <Link to={`/chapter/member/${m.user_id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                    <Avatar src={m.avatar_url} name={m.display_name} size="xs" />
                    <span className="truncate text-sm font-semibold">{m.display_name}</span>
                  </Link>
                </TD>
                <TD align="right">
                  <EloBadge elo={m.elo} size="sm" />
                </TD>
                <TD align="right" className="tabular text-sm">
                  {m.accuracy == null ? <span className="text-muted">–</span> : <span style={{ color: `var(--${accuracyTone(m.accuracy) === 'red' ? 'red' : accuracyTone(m.accuracy)})` }} className="font-semibold">{pct(m.accuracy)}</span>}
                </TD>
                <TD align="right" className="tabular max-sm:hidden text-sm">{fmt(m.answered_7d)}</TD>
                <TD align="right" className="tabular max-md:hidden text-sm">{m.current_streak ? `${m.current_streak}d` : '–'}</TD>
                <TD align="right" className="tabular max-md:hidden text-sm">{pct(m.attendance_rate)}</TD>
                <TD className="max-lg:hidden text-sm text-muted">{relativeDay(m.last_answer_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
