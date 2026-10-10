import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  History,
  Lightbulb,
  ListChecks,
  PartyPopper,
  RotateCcw,
  Search,
  Target,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
  cn,
  tabPanelProps,
} from '../../components/ui';
import { Sparkline } from '../../components/charts';
import { Page } from '../../components/layout/Page';
import { ATTEMPT_KIND_LABELS, EVENTS, NO_ELO_KINDS, eventInfo, eventName, type Attempt } from '../../lib/types';
import {
  KIND_FILTERS,
  formatDate,
  formatDuration,
  formatHours,
  listAllAttempts,
  listWrongQuestions,
  pct,
  redoUrl,
  relativeTime,
  type WrongQuestion,
} from '../../api/me';
import { useAsync, type Async } from './parts';

type Tab = 'exams' | 'wrong';
type SortKey = 'date' | 'accuracy' | 'time';

const REDO_MAX = 100;

export default function CareerPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'wrong' ? 'wrong' : 'exams';
  const attempts = useAsync(listAllAttempts, []);
  const wrong = useAsync(listWrongQuestions, []);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'exams') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  const summary = useMemo(() => {
    const rows = attempts.data ?? [];
    const total = rows.reduce((s, a) => s + a.total, 0);
    const correct = rows.reduce((s, a) => s + a.correct, 0);
    const ms = rows.reduce((s, a) => s + a.duration_ms, 0);
    const trend = rows
      .slice(0, 20)
      .reverse()
      .map((a) => (a.total ? (a.correct / a.total) * 100 : 0));
    return { count: rows.length, acc: total ? correct / total : 0, ms, trend };
  }, [attempts.data]);

  return (
    <>
      <PageHeader
        eyebrow="Me"
        title="Career"
        subtitle="Every exam you have taken, and every question still waiting for a second try."
        back={{ to: '/me', label: 'Profile' }}
      >
        <div className="flex flex-wrap gap-2.5">
          <HeaderStat label="Exams" value={attempts.data ? summary.count.toLocaleString() : '...'} />
          <HeaderStat
            label="Accuracy"
            value={attempts.data ? (summary.count ? pct(summary.acc) : '–') : '...'}
            chart={summary.trend.length > 2 ? <Sparkline values={summary.trend} width={72} height={26} color="#fff" title="Accuracy of your last exams" /> : undefined}
          />
          <HeaderStat label="Time" value={attempts.data ? formatHours(summary.ms) : '...'} />
          <HeaderStat label="To redo" value={wrong.data ? wrong.data.length.toLocaleString() : '...'} accent />
        </div>
      </PageHeader>
      <Page>
        <Tabs
          id="career"
          aria-label="Career sections"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'exams', label: 'Past exams', icon: <History />, count: attempts.data?.length },
            { value: 'wrong', label: 'Wrong questions', icon: <XCircle />, count: wrong.data?.length },
          ]}
        />
        <div {...tabPanelProps('career', tab)} className="mt-5 outline-none">
          {tab === 'exams' ? <ExamsTab q={attempts} /> : <WrongTab q={wrong} />}
        </div>
      </Page>
    </>
  );
}

function HeaderStat({ label, value, chart, accent }: { label: string; value: string; chart?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-2.5 ring-1 ring-inset', accent ? 'bg-red/90 ring-white/10' : 'bg-white/10 ring-white/15')}>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/65">{label}</div>
        <div className="tabular font-display text-xl font-extrabold text-white">{value}</div>
      </div>
      {chart}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ exams

function ExamsTab({ q }: { q: Async<Attempt[]> }) {
  const [event, setEvent] = useState('all');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [desc, setDesc] = useState(true);
  const [shown, setShown] = useState(30);

  const rows = q.data ?? [];
  const eventsUsed = useMemo(() => new Set(rows.map((a) => a.event).filter(Boolean) as string[]), [rows]);
  const kindsUsed = useMemo(() => new Set(rows.map((a) => a.kind)), [rows]);

  const filtered = useMemo(() => {
    const acc = (a: Attempt) => (a.total ? a.correct / a.total : 0);
    const key = (a: Attempt) =>
      sort === 'date' ? Date.parse(a.created_at) : sort === 'accuracy' ? acc(a) * 1000 + a.total / 1000 : a.duration_ms;
    return rows
      .filter((a) => (event === 'all' || a.event === event) && (kind === 'all' || a.kind === kind))
      .sort((a, b) => (desc ? key(b) - key(a) : key(a) - key(b)));
  }, [rows, event, kind, sort, desc]);

  if (q.loading) return <ListSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={<FileText />}
        title="No exams yet"
        description="Every practice set, mock exam and duel you finish lands here, so you can see how far you have come."
        action={<ButtonLink to="/play">Take your first exam</ButtonLink>}
      />
    );

  const sortLabel = sort === 'date' ? (desc ? 'Newest first' : 'Oldest first') : sort === 'accuracy' ? (desc ? 'Best first' : 'Worst first') : desc ? 'Longest first' : 'Shortest first';

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="grid flex-1 grid-cols-2 gap-3 md:max-w-lg">
          <Select
            label="Event"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setShown(30);
            }}
          >
            <option value="all">All events</option>
            {EVENTS.filter((e) => eventsUsed.has(e.slug)).map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setShown(30);
            }}
          >
            {KIND_FILTERS.filter((k) => k.value === 'all' || kindsUsed.has(k.value)).map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <SegmentedControl
            aria-label="Sort by"
            value={sort}
            onChange={(v) => {
              setSort(v);
              setDesc(true);
            }}
            options={[
              { value: 'date', label: 'Date' },
              { value: 'accuracy', label: 'Accuracy' },
              { value: 'time', label: 'Time' },
            ]}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDesc((d) => !d)}
            aria-label={`Sort order: ${sortLabel}. Click to reverse.`}
            title={sortLabel}
          >
            {desc ? <ArrowDownWideNarrow className="size-4" /> : <ArrowUpNarrowWide className="size-4" />}
          </Button>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted">
        <span className="tabular font-semibold text-heading">{filtered.length}</span> exam{filtered.length === 1 ? '' : 's'} · {sortLabel.toLowerCase()}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          className="mt-3"
          icon={<Search />}
          title="Nothing matches those filters"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setEvent('all');
                setKind('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.slice(0, shown).map((a) => (
            <ExamRow key={a.id} a={a} />
          ))}
        </ul>
      )}
      {filtered.length > shown && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => setShown((n) => n + 30)}>
            Show more ({filtered.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  );
}

function ExamRow({ a }: { a: Attempt }) {
  const acc = a.total ? a.correct / a.total : 0;
  const delta = a.elo_after - a.elo_before;
  const info = eventInfo(a.event);
  const tone = acc >= 0.8 ? 'success' : acc >= 0.6 ? 'warning' : 'red';
  return (
    <li>
      <Link
        to={`/play/review/${a.id}`}
        className="group flex items-center gap-3 rounded-[12px] border border-line bg-surface p-3 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lift sm:gap-4 sm:p-4"
      >
        <div
          className={cn(
            'tabular grid size-12 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold sm:size-14 sm:text-base',
            tone === 'success' && 'bg-success/12 text-success',
            tone === 'warning' && 'bg-warning/15 text-[#8a5f00] dark:text-warning',
            tone === 'red' && 'bg-red/10 text-red dark:text-danger',
          )}
        >
          {Math.round(acc * 100)}%
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-heading">{a.label || eventName(a.event)}</span>
            <Badge tone={a.kind === 'mock' ? 'navy' : a.kind === 'duel' ? 'red' : 'neutral'}>{ATTEMPT_KIND_LABELS[a.kind]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {info && a.label && <span>{info.short}</span>}
            <span className="tabular inline-flex items-center gap-1">
              <ListChecks className="size-3.5" />
              {a.correct}/{a.total}
            </span>
            <span className="tabular inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {formatDuration(a.duration_ms)}
            </span>
            <span title={new Date(a.created_at).toLocaleString()}>{relativeTime(a.created_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!NO_ELO_KINDS.includes(a.kind) && (
            <span
              className={cn(
                'tabular hidden rounded-full px-2.5 py-1 text-xs font-bold sm:inline-block',
                delta > 0 ? 'bg-success/10 text-success' : delta < 0 ? 'bg-red/10 text-red dark:text-danger' : 'bg-surface-2 text-muted',
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta} Elo
            </span>
          )}
          <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ wrong questions

function WrongTab({ q }: { q: Async<WrongQuestion[]> }) {
  const navigate = useNavigate();
  const [event, setEvent] = useState('all');
  const [area, setArea] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(20);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = q.data ?? [];
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.event, (m.get(r.event) ?? 0) + 1));
    return m;
  }, [rows]);
  const areas = useMemo(() => {
    const m = new Map<string, number>();
    rows.filter((r) => event === 'all' || r.event === event).forEach((r) => m.set(r.sub, (m.get(r.sub) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, event]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (event === 'all' || r.event === event) &&
        (area === 'all' || r.sub === area) &&
        (!s || (r.question?.q ?? '').toLowerCase().includes(s) || r.id.includes(s)),
    );
  }, [rows, event, area, search]);
  const redoable = filtered.filter((r) => r.question);

  if (q.loading) return <ListSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={<PartyPopper />}
        title="Nothing to fix"
        description="Questions you get wrong show up here until you answer them right. Right now your slate is clean."
        action={<ButtonLink to="/play">Practise something new</ButtonLink>}
      />
    );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const redoLabel = event === 'all' ? 'Redo missed' : `Redo missed: ${eventName(event)}${area === 'all' ? '' : `, ${area}`}`;

  return (
    <div>
      <div className="rounded-[12px] border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
          <Select
            label="Event"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setArea('all');
              setShown(20);
            }}
          >
            <option value="all">All events ({rows.length})</option>
            {EVENTS.filter((e) => counts.has(e.slug)).map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name} ({counts.get(e.slug)})
              </option>
            ))}
          </Select>
          <Select
            label="Section"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setShown(20);
            }}
          >
            <option value="all">All sections</option>
            {areas.map(([name, n]) => (
              <option key={name} value={name}>
                {name} ({n})
              </option>
            ))}
          </Select>
          <Input
            label="Search"
            placeholder="Words in the question"
            leftIcon={<Search />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:col-span-2 lg:col-span-1"
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            <span className="tabular font-semibold text-heading">{filtered.length}</span> question{filtered.length === 1 ? '' : 's'} where your latest answer was wrong.
            {redoable.length > REDO_MAX && ` Redo takes the ${REDO_MAX} most recent.`}
          </p>
          <Button
            variant="accent"
            leftIcon={<RotateCcw className="size-4" />}
            disabled={!redoable.length}
            onClick={() => navigate(redoUrl(redoable.slice(0, REDO_MAX).map((r) => r.id), redoLabel))}
          >
            Redo {redoable.length > 1 ? `all ${Math.min(redoable.length, REDO_MAX)}` : 'it'}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          className="mt-4"
          icon={<Search />}
          title="Nothing matches"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setEvent('all');
                setArea('all');
                setSearch('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="mt-4 space-y-2.5">
          {filtered.slice(0, shown).map((r) => (
            <WrongCard key={r.id} r={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
        </ul>
      )}
      {filtered.length > shown && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => setShown((n) => n + 20)}>
            Show more ({filtered.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  );
}

function WrongCard({ r, open, onToggle }: { r: WrongQuestion; open: boolean; onToggle: () => void }) {
  const info = eventInfo(r.event);
  const qq = r.question;
  const panelId = `wq-${r.id}`;
  return (
    <li className={cn('overflow-hidden rounded-[12px] border bg-surface transition-colors', open ? 'border-line-strong shadow-lift' : 'border-line')}>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-red/10 text-red dark:text-danger">
          <XCircle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone="navy">{info?.short ?? r.event}</Badge>
            <span className="text-muted">{r.sub}</span>
            <span className="text-muted" aria-hidden>
              ·
            </span>
            <span className="text-muted">
              Missed {r.misses}
              {r.tries > r.misses ? ` of ${r.tries} tries` : r.misses === 1 ? ' time' : ' times'} · {formatDate(r.last_at)}
            </span>
          </div>
          <p className="mt-2 text-[0.9375rem] font-medium leading-relaxed text-ink">
            {qq ? qq.q : 'This question is no longer in the bank.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {qq && (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                leftIcon={<Lightbulb className="size-4" />}
                rightIcon={<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />}
              >
                {open ? 'Hide explanation' : 'View explanation'}
              </Button>
            )}
            {qq && (
              <ButtonLink size="sm" variant="secondary" to={redoUrl([r.id], 'Redo missed')} leftIcon={<RotateCcw className="size-4" />}>
                Redo
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
      {open && qq && (
        <div id={panelId} className="animate-rise border-t border-line bg-surface-2/50 px-4 py-4 sm:pl-15">
          <ol className="space-y-1.5">
            {qq.choices.map((c, i) => {
              const right = i === qq.answer;
              const mine = i === r.chosen;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm',
                    right
                      ? 'border-success/40 bg-success/8 text-ink'
                      : mine
                        ? 'border-red/35 bg-red/[0.06] text-ink'
                        : 'border-transparent text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                      right ? 'bg-success text-white' : mine ? 'bg-red text-white' : 'bg-surface-3 text-muted',
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">{c}</span>
                  {right && <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Correct answer" />}
                  {mine && !right && <span className="shrink-0 text-xs font-semibold text-red dark:text-danger">Your answer</span>}
                </li>
              );
            })}
          </ol>
          {r.chosen == null && <p className="mt-2 text-xs text-muted">You ran out of time on this one last time.</p>}
          {qq.explain && (
            <div className="mt-3 flex gap-2.5 rounded-lg bg-blue/8 p-3 text-sm text-ink dark:bg-blue/15">
              <Target className="mt-0.5 size-4 shrink-0 text-blue dark:text-link" />
              <p className="leading-relaxed">{qq.explain}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      <Skeleton className="h-20" rounded="rounded-[12px]" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[74px]" rounded="rounded-[12px]" />
      ))}
    </div>
  );
}
