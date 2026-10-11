// Read-only sections of the owner console: Overview, Growth, Engagement, Preparation and Content.
// Every number comes from the owner RPCs (supabase/migrations/0105); nothing here invents or pads data.
import { useState, type ReactNode } from 'react';
import { BarChart, ChartFigure, LineChart } from '../../components/charts';
import { Badge, EmptyState, SegmentedControl, StatTile, Table, TBody, TD, TH, THead, TR } from '../../components/ui';
import { cn } from '../../components/ui/cn';
import type { OwnerContent, OwnerEngagement, OwnerGrowth, OwnerOverview, OwnerPreparation, PrepRow } from '../../api/owner';
import {
  bucketLabel,
  bucketsFor,
  countLabel,
  featureLabel,
  fmtPercent,
  seriesBars,
  type Bucket,
  type Count,
  type GrowthRow,
} from '../../lib/owner';
import { STATUS_LABELS, type FeedbackStatus } from '../../lib/feedback';
import { ATTEMPT_KIND_LABELS, eventName, type AttemptKind } from '../../lib/types';
import { CountText, dateOnly, LoadState, num, Panel, PrivacyNote, useLoad, useOwnerSource } from './shared';

const sub = (c: Count) => (c.suppressed ? 'hidden for privacy' : undefined);

// ------------------------------------------------------------------------------------------------ overview

export function OverviewSection({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const state = useLoad(() => src.overview(), `overview:${refreshKey}`);
  return <LoadState state={state}>{(d) => <OverviewView data={d} />}</LoadState>;
}

export function OverviewView({ data: d }: { data: OwnerOverview }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="navy" label="Accounts" value={<CountText c={d.accounts} />} sub={`${countLabel(d.profiles)} finished sign-up`} />
        <StatTile tone="navy" label="Active today" value={<CountText c={d.active.dau} />} sub={sub(d.active.dau) ?? 'since midnight, Toronto'} />
        <StatTile tone="navy" label="Active this week" value={<CountText c={d.active.wau} />} sub={sub(d.active.wau) ?? 'last 7 days'} />
        <StatTile tone="navy" label="Active this month" value={<CountText c={d.active.mau} />} sub={sub(d.active.mau) ?? 'last 30 days'} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel>
          <h3 className="text-sm font-bold text-heading">New accounts</h3>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['Today', d.new_accounts.day],
                ['7 days', d.new_accounts.week],
                ['30 days', d.new_accounts.month],
              ] as const
            ).map(([label, c]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 font-display text-xl font-extrabold text-heading">
                  <CountText c={c} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <h3 className="text-sm font-bold text-heading">Finished sign-up</h3>
          <p className="mt-1 text-xs text-muted">Accounts that went on to create a profile</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted">Last 30 days</dt>
              <dd className="tabular mt-0.5 font-display text-xl font-extrabold text-heading">{fmtPercent(d.onboarding.month.rate)}</dd>
              <dd className="text-xs text-muted">
                <CountText c={d.onboarding.month.onboarded} /> of <CountText c={d.onboarding.month.created} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">All time</dt>
              <dd className="tabular mt-0.5 font-display text-xl font-extrabold text-heading">{fmtPercent(d.onboarding.all_time.rate)}</dd>
              <dd className="text-xs text-muted">
                <CountText c={d.onboarding.all_time.onboarded} /> of <CountText c={d.onboarding.all_time.created} />
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel>
          <h3 className="text-sm font-bold text-heading">Coming back</h3>
          <p className="mt-1 text-xs text-muted">Active on 2 or more days in the last 30</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted">Students</dt>
              <dd className="mt-0.5 font-display text-xl font-extrabold text-heading">
                <CountText c={d.returning} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Of monthly active</dt>
              <dd className="tabular mt-0.5 font-display text-xl font-extrabold text-heading">{fmtPercent(d.returning_rate)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-sm font-bold text-heading">Questions answered this week</h3>
          <p className="text-sm text-muted">
            <span className="tabular font-display text-xl font-extrabold text-heading">{num(d.answered_week.questions)}</span>
            <span className="ml-2">
              by <CountText c={d.answered_week.users} /> students
            </span>
          </p>
        </div>
      </Panel>

      <div className="flex flex-col gap-1 text-xs text-muted sm:flex-row sm:justify-between">
        <PrivacyNote />
        <p>
          {d.tracking_since
            ? `Feature tracking started ${dateOnly(d.tracking_since)}. Practice history counts from the start.`
            : 'Feature tracking has no events yet. Activity counts use practice history only.'}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ growth

const pad2 = (n: number) => String(n).padStart(2, '0');
/** LineChart hands date axes back as local-midnight epochs; label them like the bar charts ("Oct 5"). */
const axisDay = (n: number) => {
  const d = new Date(n);
  const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return bucketLabel(day, day, 'day', true);
};

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

export function GrowthSection({ days, refreshKey }: { days: number; refreshKey: number }) {
  const src = useOwnerSource();
  const allowed = bucketsFor(days);
  const [picked, setPicked] = useState<Bucket>('day');
  const bucket = allowed.includes(picked) ? picked : allowed[allowed.length - 1];
  const state = useLoad(() => src.growth(days, bucket), `growth:${days}:${bucket}:${refreshKey}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          One bar per {bucket}, Toronto time. A dashed stub is a group of 1 to 4 people, hidden for privacy.
        </p>
        <SegmentedControl
          size="sm"
          aria-label="Group by"
          value={bucket}
          onChange={setPicked}
          options={BUCKETS.filter((b) => allowed.includes(b.value))}
        />
      </div>
      <LoadState state={state} skeleton="chart">
        {(d) => <GrowthView data={d} />}
      </LoadState>
    </div>
  );
}

function growthTable(rows: GrowthRow[], bucket: Bucket, key: keyof Omit<GrowthRow, 'start' | 'end'>) {
  return {
    columns: [bucket === 'day' ? 'Day' : bucket === 'week' ? 'Week' : 'Month', 'Students'],
    rows: rows.map((r) => [bucketLabel(r.start, r.end, bucket), countLabel(r[key])]),
  };
}

export function GrowthView({ data }: { data: OwnerGrowth }) {
  const rows = data.series;
  const b = data.bucket;
  if (!rows.length) return <EmptyState compact title="No data in this range" description="Pick a longer range." />;
  const charts: { key: 'signups' | 'active' | 'practising' | 'onboarded'; title: string; description: string }[] = [
    { key: 'signups', title: 'New accounts', description: 'Accounts created on the FBLA site' },
    { key: 'active', title: 'Active students', description: 'Practised, reviewed vocab, duelled or used a feature' },
    { key: 'practising', title: 'Students who practised', description: 'Finished at least one practice run or exam' },
    { key: 'onboarded', title: 'Finished sign-up', description: 'Profiles created' },
  ];
  const total = rows.filter((r) => !r.total.suppressed && r.total.value != null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((c) => (
          <Panel key={c.key}>
            <ChartFigure title={c.title} description={c.description} table={growthTable(rows, b, c.key)}>
              <BarChart
                title={`${c.title} per ${b}`}
                orientation="vertical"
                height={200}
                color={c.key === 'signups' ? 'var(--red)' : undefined}
                data={seriesBars(rows, c.key, b)}
              />
            </ChartFigure>
          </Panel>
        ))}
      </div>
      <Panel>
        <ChartFigure title="Total accounts" description="Running total at the end of each period" table={growthTable(rows, b, 'total')}>
          <LineChart
            title="Total accounts over time"
            height={200}
            series={[{ name: 'Accounts', data: total.map((r) => ({ x: r.end, y: r.total.value ?? 0 })) }]}
            formatX={axisDay}
            emptyLabel="Under 5 accounts so far"
          />
        </ChartFigure>
      </Panel>
      <PrivacyNote />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ engagement

export function EngagementSection({ days, refreshKey }: { days: number; refreshKey: number }) {
  const src = useOwnerSource();
  const state = useLoad(() => src.engagement(days), `engagement:${days}:${refreshKey}`);
  return <LoadState state={state}>{(d) => <EngagementView data={d} />}</LoadState>;
}

const kindLabel = (k: string) => ATTEMPT_KIND_LABELS[k as AttemptKind] ?? featureLabel(k);

export function EngagementView({ data: d }: { data: OwnerEngagement }) {
  const features = [...d.features].sort((a, b) => (b.users.value ?? 0) - (a.users.value ?? 0));
  const used = features.filter((f) => f.users.suppressed || (f.users.value ?? 0) > 0);
  const popular = d.popular_events.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel>
          <h3 className="text-sm font-bold text-heading">Practice runs</h3>
          <p className="mt-1 text-xs text-muted">Started in the app, then finished and graded</p>
          <div className="mt-4 grid grid-cols-3 items-end gap-3">
            <Metric label="Started" value={num(d.practice.started.events)} sub={<><CountText c={d.practice.started.users} /> students</>} />
            <Metric label="Finished" value={num(d.practice.completed.events)} sub={<><CountText c={d.practice.completed.users} /> students</>} />
            <Metric label="Finish rate" value={fmtPercent(d.practice.completion_rate)} accent />
          </div>
        </Panel>
        <Panel>
          <h3 className="text-sm font-bold text-heading">Arena duels</h3>
          <p className="mt-1 text-xs text-muted">Head-to-head challenges between students</p>
          <div className="mt-4 grid grid-cols-3 items-end gap-3">
            <Metric label="Players" value={<CountText c={d.duels.players} />} />
            <Metric label="Started" value={num(d.duels.created)} />
            <Metric label="Finished" value={num(d.duels.completed)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <ChartFigure
            title="Features used"
            description="Students who did each thing at least once"
            table={{
              columns: ['Feature', 'Students', 'Times'],
              rows: features.map((f) => [featureLabel(f.name), countLabel(f.users), num(f.events)]),
            }}
          >
            <BarChart
              title="Students per feature"
              emptyLabel="No feature use in this range"
              data={used.map((f) => ({
                label: featureLabel(f.name),
                value: f.users.value ?? 0,
                suppressed: f.users.suppressed,
                sub: f.events != null ? `${num(f.events)} times` : undefined,
              }))}
            />
          </ChartFigure>
        </Panel>
        <Panel>
          <ChartFigure
            title="Most practised events"
            description="Students who chose or practised each event"
            table={{
              columns: ['Event', 'Students', 'Times'],
              rows: popular.map((e) => [eventName(e.code), countLabel(e.users), num(e.events)]),
            }}
          >
            <BarChart
              title="Students per event"
              color="var(--red)"
              emptyLabel="No events chosen in this range"
              data={popular.map((e) => ({
                label: eventName(e.code),
                value: e.users.value ?? 0,
                suppressed: e.users.suppressed,
              }))}
            />
          </ChartFigure>
        </Panel>
      </div>

      <Panel>
        <div>
          <h3 className="text-sm font-bold text-heading">Practice modes</h3>
          <p className="mt-0.5 text-xs text-muted">Graded runs by mode</p>
        </div>
        {d.modes.length ? (
          <Table wrapClassName="mt-3">
            <THead>
              <tr>
                <TH>Mode</TH>
                <TH align="right">Students</TH>
                <TH align="right">Runs</TH>
              </tr>
            </THead>
            <TBody>
              {d.modes.map((m) => (
                <TR key={m.mode}>
                  <TD className="font-medium text-ink">{kindLabel(m.mode)}</TD>
                  <TD align="right">
                    <CountText c={m.users} />
                  </TD>
                  <TD align="right">{num(m.attempts)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="pt-3 text-sm text-muted">No graded runs in this range.</p>
        )}
      </Panel>
      <PrivacyNote />
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('tabular mt-0.5 font-display text-2xl font-extrabold leading-none', accent ? 'text-red' : 'text-heading')}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ preparation

export function PreparationSection({ days, refreshKey }: { days: number; refreshKey: number }) {
  const src = useOwnerSource();
  const state = useLoad(() => src.preparation(days), `prep:${days}:${refreshKey}`);
  return (
    <LoadState state={state} skeleton="table">
      {(d) => <PreparationView data={d} />}
    </LoadState>
  );
}

const byStudents = (a: PrepRow, b: PrepRow) =>
  Number(a.users.suppressed) - Number(b.users.suppressed) || (b.users.value ?? 0) - (a.users.value ?? 0) || a.event.localeCompare(b.event);

export function PreparationView({ data }: { data: OwnerPreparation }) {
  const rows = [...data.events].sort(byStudents);
  if (!rows.length)
    return <EmptyState compact title="No practice in this range" description="Event readiness shows up once students finish practice runs." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Practice runs and mock exams only, not duels or chapter tests. Accuracy and the share of runs not finished show
        only when 5 or more students took part.
      </p>
      <Table>
        <THead>
          <tr>
            <TH>Event</TH>
            <TH align="right">Students</TH>
            <TH align="right">Runs</TH>
            <TH align="right">Answered</TH>
            <TH className="min-w-40">Accuracy</TH>
            <TH align="right">Not finished</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.event}>
              <TD className="font-medium text-ink">{eventName(r.event)}</TD>
              <TD align="right">
                <CountText c={r.users} />
              </TD>
              <TD align="right">{num(r.attempts)}</TD>
              <TD align="right">{num(r.answered)}</TD>
              <TD>
                <AccuracyBar rate={r.accuracy} />
              </TD>
              <TD align="right">{fmtPercent(r.abandonment)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <PrivacyNote />
    </div>
  );
}

function AccuracyBar({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-sm text-muted">Not enough students</span>;
  const pct = Math.round(rate * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-16 flex-1 bg-surface-3" aria-hidden>
        <div className={cn('h-full', pct < 60 ? 'bg-red' : 'bg-blue')} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-10 text-right text-sm font-semibold text-heading">{pct}%</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ content

export function ContentSection({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const state = useLoad(() => src.content(), `content:${refreshKey}`);
  return (
    <LoadState state={state} skeleton="table">
      {(d) => <ContentView data={d} />}
    </LoadState>
  );
}

const STATUS_ORDER: FeedbackStatus[] = ['new', 'triaged', 'in_progress', 'resolved', 'wontfix'];

export function ContentView({ data: d }: { data: OwnerContent }) {
  const totals = d.events.reduce(
    (t, e) => ({
      questions: t.questions + e.questions,
      easy: t.easy + e.easy,
      medium: t.medium + e.medium,
      hard: t.hard + e.hard,
      terms: t.terms + e.terms,
    }),
    { questions: 0, easy: 0, medium: 0, hard: 0, terms: 0 },
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-heading">All feedback</span>
        {STATUS_ORDER.map((s) => (
          <Badge key={s} tone={s === 'new' ? 'red' : s === 'resolved' ? 'success' : 'neutral'}>
            {STATUS_LABELS[s]} <span className="tabular">{d.feedback_status[s] ?? 0}</span>
          </Badge>
        ))}
      </div>

      <section aria-labelledby="owner-reported">
        <h3 id="owner-reported" className="text-base font-bold text-heading">
          Reported questions
        </h3>
        <p className="mt-0.5 text-sm text-muted">Questions students flagged from exam review, most open reports first.</p>
        {d.reported_questions.length ? (
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {d.reported_questions.map((q) => (
              <li key={q.question_id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <code className="font-mono font-semibold text-ink">{q.question_id}</code>
                    <span>{eventName(q.event)}</span>
                    {q.area && <span>· {q.area}</span>}
                  </div>
                  {q.preview && <p className="mt-1 line-clamp-2 text-sm text-ink">{q.preview}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  {q.open > 0 ? <Badge tone="red">{q.open} open</Badge> : <Badge tone="success">All handled</Badge>}
                  <span className="tabular text-muted">
                    {q.reports} {q.reports === 1 ? 'report' : 'reports'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact className="mt-3" title="No question reports" description="When a student reports a question, it shows up here and in Feedback." />
        )}
      </section>

      <section aria-labelledby="owner-hardest">
        <h3 id="owner-hardest" className="text-base font-bold text-heading">
          Hardest questions
        </h3>
        <p className="mt-0.5 text-sm text-muted">Lowest accuracy among questions answered by 5 or more students. Worth a check for a wrong key.</p>
        {d.hardest_questions.length ? (
          <Table wrapClassName="mt-3">
            <THead>
              <tr>
                <TH>Question</TH>
                <TH align="right">Students</TH>
                <TH align="right">Answers</TH>
                <TH align="right">Accuracy</TH>
              </tr>
            </THead>
            <TBody>
              {d.hardest_questions.map((q) => (
                <TR key={q.question_id}>
                  <TD className="max-w-xl">
                    <div className="text-xs text-muted">
                      <code className="font-mono font-semibold text-ink">{q.question_id}</code> · {eventName(q.event)}
                    </div>
                    {q.preview && <div className="mt-0.5 line-clamp-1 text-sm text-ink">{q.preview}</div>}
                  </TD>
                  <TD align="right">
                    <CountText c={q.students} />
                  </TD>
                  <TD align="right">{num(q.answers)}</TD>
                  <TD align="right" className={cn('font-semibold', q.accuracy < 0.4 ? 'text-red' : 'text-heading')}>
                    {fmtPercent(q.accuracy)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState compact className="mt-3" title="Not enough answers yet" description="A question shows here once 5 or more students have answered it." />
        )}
      </section>

      <section aria-labelledby="owner-bank">
        <h3 id="owner-bank" className="text-base font-bold text-heading">
          Question bank
        </h3>
        <p className="mt-0.5 text-sm text-muted">Official questions and vocab terms per event.</p>
        <Table wrapClassName="mt-3">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH align="right">Questions</TH>
              <TH align="right">Areas</TH>
              <TH align="right">Easy</TH>
              <TH align="right">Medium</TH>
              <TH align="right">Hard</TH>
              <TH align="right">Vocab</TH>
            </tr>
          </THead>
          <TBody>
            {d.events.map((e) => (
              <TR key={e.event}>
                <TD className="font-medium text-ink">{eventName(e.event)}</TD>
                <TD align="right" className={cn(e.questions < 100 && 'font-semibold text-red')}>
                  {num(e.questions)}
                </TD>
                <TD align="right">{num(e.areas)}</TD>
                <TD align="right">{num(e.easy)}</TD>
                <TD align="right">{num(e.medium)}</TD>
                <TD align="right">{num(e.hard)}</TD>
                <TD align="right">{num(e.terms)}</TD>
              </TR>
            ))}
            <TR className="bg-surface-2/70 font-semibold">
              <TD className="text-heading">All events</TD>
              <TD align="right">{num(totals.questions)}</TD>
              <TD align="right" />
              <TD align="right">{num(totals.easy)}</TD>
              <TD align="right">{num(totals.medium)}</TD>
              <TD align="right">{num(totals.hard)}</TD>
              <TD align="right">{num(totals.terms)}</TD>
            </TR>
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-muted">Events with fewer than 100 questions are marked in red: a full competition test is 100.</p>
      </section>
    </div>
  );
}
