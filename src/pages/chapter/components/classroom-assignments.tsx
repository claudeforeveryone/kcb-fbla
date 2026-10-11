import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Modal,
  ProgressBar,
  SegmentedControl,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
} from '../../../components/ui';
import { ROLE_LABELS } from '../../../lib/types';
import {
  assignmentRunHref,
  assignmentStatus,
  bestAttempt,
  canManage,
  pct,
  type AssignmentStatus,
  type AttemptLite,
  type ClassAssignment,
  type ClassDeck,
  type ClassTest,
  type ClassroomContext,
} from '../../../api/classroom';
import { excerpt } from './classroom-markdown';
import { ASSIGNMENT_META, EventTag, KindLabel, dueLabel, formatDate, pluralize, timeAgo } from './classroom-shared';

const KIND_ACCENT = { test: 'bg-blue text-white', deck: 'bg-success text-white', official: 'border border-navy bg-surface text-navy dark:border-link dark:text-link' } as const;

function scoreTone(p: number) {
  return p >= 80 ? 'text-success' : p >= 60 ? 'text-warning' : 'text-red dark:text-danger';
}

type Common = {
  ctx: ClassroomContext;
  assignments: ClassAssignment[];
  attempts: AttemptLite[];
  tests: ClassTest[];
  decks: ClassDeck[];
  onStudyDeck: (a: ClassAssignment) => void;
  onNew: () => void;
  onEdit: (a: ClassAssignment) => void;
  onDelete: (a: ClassAssignment) => void;
  focusId: string | null;
  onFocus: (id: string | null) => void;
};

export function AssignmentsPanel(props: Common & { staff: boolean }) {
  const [view, setView] = useState<'mine' | 'manage'>(props.staff ? 'manage' : 'mine');
  return (
    <div>
      {props.staff && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            aria-label="Assignments view"
            value={view}
            onChange={setView}
            options={[
              { value: 'manage', label: 'Track progress' },
              { value: 'mine', label: 'My to-do' },
            ]}
          />
          <Button variant="accent" leftIcon={<Plus className="size-4" />} onClick={props.onNew}>
            New assignment
          </Button>
        </div>
      )}
      {view === 'manage' && props.staff ? <ManageList {...props} /> : <MyList {...props} />}
      <AssignmentDetail {...props} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ member view

function MyList({ ctx, assignments, attempts, tests, decks, onStudyDeck }: Common) {
  const mine = useMemo(() => attempts.filter((t) => t.user_id === ctx.me.id), [attempts, ctx.me.id]);
  const rows = useMemo(() => {
    const now = Date.now();
    return assignments.map((a) => {
      const at = mine.filter((t) => t.assignment_id === a.id);
      return { a, at, status: assignmentStatus(a, at, now), best: bestAttempt(at) };
    });
  }, [assignments, mine]);
  const counts = { todo: 0, overdue: 0, done: 0 } as Record<AssignmentStatus, number>;
  for (const r of rows) counts[r.status]++;
  const [filter, setFilter] = useState<AssignmentStatus>(counts.todo || !counts.overdue ? 'todo' : 'overdue');

  const shown = rows
    .filter((r) => r.status === filter)
    .sort((x, y) => {
      if (filter === 'done') return (y.at[0]?.created_at ?? '').localeCompare(x.at[0]?.created_at ?? '');
      const dx = x.a.due_at ? new Date(x.a.due_at).getTime() : Infinity;
      const dy = y.a.due_at ? new Date(y.a.due_at).getTime() : Infinity;
      return filter === 'overdue' ? dy - dx : dx - dy;
    });

  if (!assignments.length)
    return (
      <EmptyState
        title="No assignments yet"
        description="When your executives or trainers assign a test or a deck, it shows up here with its due date."
        action={<ButtonLink to="/play" variant="outline">Practise on your own</ButtonLink>}
      />
    );

  return (
    <div>
      <SegmentedControl
        aria-label="Filter assignments"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todo', label: <span>To do <Count n={counts.todo} /></span> },
          { value: 'overdue', label: <span>Overdue <Count n={counts.overdue} danger /></span> },
          { value: 'done', label: <span>Done <Count n={counts.done} /></span> },
        ]}
      />
      <div className="mt-4 grid gap-3">
        {shown.map(({ a, at, status, best }) => (
          <MyCard key={a.id} a={a} attempts={at} status={status} best={best} tests={tests} decks={decks} onStudyDeck={onStudyDeck} />
        ))}
        {!shown.length && (
          <EmptyState
            compact
            title={filter === 'todo' ? 'All caught up' : filter === 'overdue' ? 'Nothing overdue' : 'Nothing finished yet'}
            description={filter === 'done' ? 'Finished assignments and your scores collect here.' : 'Nice work. Keep your streak going with a quick practice set.'}
            action={filter !== 'done' ? <ButtonLink to="/play" variant="outline" size="sm">Quick practice</ButtonLink> : undefined}
          />
        )}
      </div>
    </div>
  );
}

function Count({ n, danger }: { n: number; danger?: boolean }) {
  return (
    <span className={cn('tabular ml-1 rounded-[2px] px-1.5 text-[11px]', danger && n ? 'bg-red text-white' : 'bg-surface-3 text-muted')}>{n}</span>
  );
}

function sizeLabel(a: ClassAssignment, tests: ClassTest[], decks: ClassDeck[]) {
  if (a.kind === 'test') {
    const t = tests.find((x) => x.id === a.ref);
    if (!t) return null;
    return `${pluralize(t.questions.length, 'question')}${t.time_limit_sec ? ` · ${Math.round(t.time_limit_sec / 60)} min` : ''}`;
  }
  if (a.kind === 'deck') {
    const d = decks.find((x) => x.id === a.ref);
    return d ? pluralize(d.cards.length, 'card') : null;
  }
  return '25 questions';
}

function MyCard({
  a,
  attempts,
  status,
  best,
  tests,
  decks,
  onStudyDeck,
}: {
  a: ClassAssignment;
  attempts: AttemptLite[];
  status: AssignmentStatus;
  best: AttemptLite | null;
  tests: ClassTest[];
  decks: ClassDeck[];
  onStudyDeck: (a: ClassAssignment) => void;
}) {
  const meta = ASSIGNMENT_META[a.kind];
  const due = dueLabel(a.due_at);
  const size = sizeLabel(a, tests, decks);
  const missing = (a.kind === 'test' && !tests.some((t) => t.id === a.ref)) || (a.kind === 'deck' && !decks.some((d) => d.id === a.ref));
  const action = missing ? null : a.kind === 'deck' ? (
    <Button variant={status === 'done' ? 'outline' : 'primary'} size="sm" onClick={() => onStudyDeck(a)} leftIcon={status === 'done' ? <RotateCcw className="size-4" /> : undefined}>
      {status === 'done' ? 'Study again' : meta.verb}
    </Button>
  ) : (
    <ButtonLink to={assignmentRunHref(a)} variant={status === 'done' ? 'outline' : status === 'overdue' ? 'accent' : 'primary'} size="sm" leftIcon={status === 'done' ? <RotateCcw className="size-4" /> : undefined}>
      {status === 'done' ? 'Retake' : meta.verb}
    </ButtonLink>
  );

  return (
    <Card padded={false} id={`assignment-${a.id}`} className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5', status === 'overdue' && 'border-red/30')}>
      <div className="flex min-w-0 flex-1 gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <KindLabel label={meta.label} accent={KIND_ACCENT[a.kind]} />
            <EventTag event={a.event} />
          </div>
          <h3 className="mt-1 text-base font-bold leading-snug">{a.title}</h3>
          {a.instructions && <p className="mt-1 text-sm text-ink/80">{excerpt(a.instructions, 200)}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
            {status !== 'done' && (
              <span className={cn('font-semibold', due.tone === 'danger' ? 'text-red dark:text-danger' : due.tone === 'warning' ? 'text-[#8a5f00] dark:text-warning' : 'text-muted')}>
                {due.text}
              </span>
            )}
            {size && <span className="text-muted">{size}</span>}
            {missing && <span className="text-muted">The {a.kind === 'test' ? 'test' : 'deck'} was removed.</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        {status === 'done' && best && (
          <div className="text-right">
            <div className={cn('tabular font-display text-2xl font-extrabold leading-none', scoreTone(pct(best.correct, best.total)))}>
              {pct(best.correct, best.total)}%
            </div>
            <div className="mt-1 text-xs text-muted">
              {a.kind === 'deck' ? `${best.correct}/${best.total} known` : `${best.correct}/${best.total} best`}
              {attempts.length > 1 && ` · ${attempts.length} tries`}
            </div>
          </div>
        )}
        {status === 'done' && !best && <Badge tone="success">Done</Badge>}
        {action}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ staff view

function ManageList({ ctx, assignments, attempts, onFocus, onNew }: Common) {
  const [filter, setFilter] = useState<'open' | 'past' | 'all'>('open');
  const now = Date.now();
  const stats = useMemo(() => {
    const m = new Map<string, { done: number; eligible: number; avg: number | null }>();
    for (const a of assignments) {
      const eligible = ctx.members.filter((x) => x.user_id !== a.assigned_by);
      const byUser = new Map<string, AttemptLite[]>();
      for (const t of attempts) if (t.assignment_id === a.id) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);
      const bests = eligible.map((x) => bestAttempt(byUser.get(x.user_id) ?? [])).filter((b): b is AttemptLite => !!b);
      m.set(a.id, {
        done: bests.length,
        eligible: eligible.length,
        avg: bests.length ? Math.round(bests.reduce((s, b) => s + pct(b.correct, b.total), 0) / bests.length) : null,
      });
    }
    return m;
  }, [assignments, attempts, ctx.members]);

  const isPast = (a: ClassAssignment) => !!a.due_at && new Date(a.due_at).getTime() < now;
  const shown = assignments
    .filter((a) => (filter === 'all' ? true : filter === 'past' ? isPast(a) : !isPast(a)))
    .sort((x, y) => {
      const dx = x.due_at ? new Date(x.due_at).getTime() : Infinity;
      const dy = y.due_at ? new Date(y.due_at).getTime() : Infinity;
      return filter === 'past' ? dy - dx : dx - dy || y.created_at.localeCompare(x.created_at);
    });

  if (!assignments.length)
    return (
      <EmptyState
        title="Assign your first piece of work"
        description="Pick a chapter test, a flashcard deck or a set of official questions, give it a due date, and watch completion roll in."
        action={
          <Button variant="accent" leftIcon={<Plus className="size-4" />} onClick={onNew}>
            New assignment
          </Button>
        }
      />
    );

  return (
    <div>
      <SegmentedControl
        size="sm"
        aria-label="Filter assignments"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'past', label: 'Past due' },
          { value: 'all', label: 'All' },
        ]}
      />
      <div className="mt-4 grid gap-3">
        {shown.map((a) => {
          const s = stats.get(a.id)!;
          const meta = ASSIGNMENT_META[a.kind];
          const due = dueLabel(a.due_at);
          const rate = s.eligible ? s.done / s.eligible : 0;
          return (
            <Card key={a.id} interactive padded={false} className="cursor-pointer">
              <button type="button" onClick={() => onFocus(a.id)} className="flex w-full flex-col gap-4 p-4 text-left sm:flex-row sm:items-center sm:p-5">
                <div className="flex min-w-0 flex-1 gap-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      <KindLabel label={meta.label} accent={KIND_ACCENT[a.kind]} />
                      <EventTag event={a.event} />
                    </div>
                    <h3 className="mt-1 truncate text-base font-bold">{a.title}</h3>
                    <span className={cn('mt-1 block text-[0.8125rem] font-semibold', isPast(a) ? 'text-muted' : due.tone === 'warning' ? 'text-[#8a5f00] dark:text-warning' : 'text-muted')}>
                      {isPast(a) ? `Was due ${formatDate(a.due_at!, true)}` : due.text}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-5 sm:w-80">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-ink">
                        <span className="tabular">{s.done}</span>
                        <span className="text-muted">/{s.eligible} done</span>
                      </span>
                      <span className="tabular text-muted">{Math.round(rate * 100)}%</span>
                    </div>
                    <ProgressBar value={s.done} max={Math.max(1, s.eligible)} size="sm" tone={rate >= 0.8 ? 'success' : isPast(a) && rate < 0.5 ? 'red' : 'blue'} />
                  </div>
                  <div className="w-14 text-right">
                    <div className={cn('tabular font-display text-xl font-extrabold leading-none', s.avg == null ? 'text-muted' : scoreTone(s.avg))}>
                      {s.avg == null ? '–' : `${s.avg}%`}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">avg</div>
                  </div>
                  <ChevronRight className="hidden size-5 shrink-0 text-muted sm:block" />
                </div>
              </button>
            </Card>
          );
        })}
        {!shown.length && (
          <EmptyState compact title={filter === 'open' ? 'No open assignments' : 'Nothing past due'} description="Switch the filter to see the rest." />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ detail (per member)

type Sort = 'status' | 'name' | 'score';

function AssignmentDetail({ ctx, assignments, attempts, tests, decks, focusId, onFocus, onEdit, onDelete, onStudyDeck }: Common) {
  const a = assignments.find((x) => x.id === focusId) ?? null;
  const [sort, setSort] = useState<Sort>('status');
  const staffView = !!a && (ctx.me.role !== 'member' || ctx.trainerEvents.length > 0);

  const rows = useMemo(() => {
    if (!a) return [];
    const now = Date.now();
    return ctx.members
      .filter((m) => m.user_id !== a.assigned_by)
      .map((m) => {
        const at = attempts.filter((t) => t.assignment_id === a.id && t.user_id === m.user_id);
        const best = bestAttempt(at);
        return { m, at, best, status: assignmentStatus(a, at, now) };
      });
  }, [a, attempts, ctx.members]);

  if (!a) return null;
  const meta = ASSIGNMENT_META[a.kind];
  const order: Record<AssignmentStatus, number> = { overdue: 0, todo: 1, done: 2 };
  const sorted = [...rows].sort((x, y) => {
    if (sort === 'name') return x.m.profile.display_name.localeCompare(y.m.profile.display_name);
    if (sort === 'score') return (y.best ? pct(y.best.correct, y.best.total) : -1) - (x.best ? pct(x.best.correct, x.best.total) : -1);
    return order[x.status] - order[y.status] || x.m.profile.display_name.localeCompare(y.m.profile.display_name);
  });
  const done = rows.filter((r) => r.status === 'done');
  const avg = done.length ? Math.round(done.reduce((s, r) => s + pct(r.best!.correct, r.best!.total), 0) / done.length) : null;
  const top = done.length ? done.reduce((b, r) => (pct(r.best!.correct, r.best!.total) > pct(b.best!.correct, b.best!.total) ? r : b)) : null;
  const manage = canManage(ctx, a.event);
  const myAt = attempts.filter((t) => t.assignment_id === a.id && t.user_id === ctx.me.id);
  const missing = (a.kind === 'test' && !tests.some((t) => t.id === a.ref)) || (a.kind === 'deck' && !decks.some((d) => d.id === a.ref));

  return (
    <Modal
      open={!!a}
      onClose={() => onFocus(null)}
      size="xl"
      title={a.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {meta.label}
          <EventTag event={a.event} />
          <span>· {a.due_at ? `Due ${formatDate(a.due_at, true)}` : 'No due date'}</span>
          <span>· assigned {timeAgo(a.created_at)}</span>
        </span>
      }
      footer={
        <>
          {manage && (
            <>
              <Button variant="danger" className="sm:mr-auto" leftIcon={<Trash2 className="size-4" />} onClick={() => onDelete(a)}>
                Delete
              </Button>
              <Button variant="outline" leftIcon={<Pencil className="size-4" />} onClick={() => onEdit(a)}>
                Edit
              </Button>
            </>
          )}
          {!missing &&
            (a.kind === 'deck' ? (
              <Button onClick={() => onStudyDeck(a)}>{myAt.length ? 'Study again' : meta.verb}</Button>
            ) : (
              <ButtonLink to={assignmentRunHref(a)}>{myAt.length ? 'Retake' : meta.verb}</ButtonLink>
            ))}
        </>
      }
    >
      {a.instructions && <p className="mb-4 whitespace-pre-line rounded-[2px] border-l-4 border-navy bg-surface-2 px-4 py-3 text-sm text-ink/90">{a.instructions}</p>}
      {staffView ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Completed" value={`${done.length}/${rows.length}`} />
            <Stat label="Average" value={avg == null ? '–' : `${avg}%`} tone={avg == null ? undefined : scoreTone(avg)} />
            <Stat label={a.due_at && new Date(a.due_at).getTime() < Date.now() ? 'Missed' : 'Not started'} value={String(rows.length - done.length)} />
          </div>
          {top && top.best && (
            <p className="mt-3 text-sm text-muted">
              Top score: <span className="font-semibold text-ink">{top.m.profile.display_name}</span> with {pct(top.best.correct, top.best.total)}%
            </p>
          )}
          <div className="mt-4">
            <Table>
              <THead>
                <tr>
                  <TH sort={sort === 'name' ? 'asc' : null} onSort={() => setSort('name')}>Member</TH>
                  <TH sort={sort === 'status' ? 'asc' : null} onSort={() => setSort('status')}>Status</TH>
                  <TH align="right" sort={sort === 'score' ? 'desc' : null} onSort={() => setSort('score')}>Best</TH>
                  <TH align="right" className="hidden sm:table-cell">Tries</TH>
                  <TH align="right" className="hidden md:table-cell">Last</TH>
                </tr>
              </THead>
              <TBody>
                {sorted.map(({ m, at, best, status }) => (
                  <TR key={m.user_id} highlight={m.user_id === ctx.me.id}>
                    <TD>
                      <Link to={`/chapter/member/${m.user_id}`} className="flex min-w-0 items-center gap-2.5 hover:text-blue">
                        <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{m.profile.display_name}</span>
                          <span className="block truncate text-xs text-muted">
                            @{m.profile.username}
                            {m.role !== 'member' && ` · ${ROLE_LABELS[m.role]}`}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      {status === 'done' ? (
                        <Badge tone="success" dot>Done</Badge>
                      ) : status === 'overdue' ? (
                        <Badge tone="red" dot>Missed</Badge>
                      ) : (
                        <Badge tone="neutral" dot>To do</Badge>
                      )}
                    </TD>
                    <TD align="right">
                      {best ? (
                        <span className={cn('font-display font-bold', scoreTone(pct(best.correct, best.total)))}>
                          {pct(best.correct, best.total)}%
                          <span className="ml-1 hidden text-xs font-normal text-muted sm:inline">
                            {best.correct}/{best.total}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </TD>
                    <TD align="right" className="hidden sm:table-cell">{at.length || '–'}</TD>
                    <TD align="right" className="hidden text-muted md:table-cell">{at[0] ? timeAgo(at[0].created_at) : '–'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {!rows.length && <p className="mt-3 text-center text-sm text-muted">No other members in the chapter yet.</p>}
          </div>
        </>
      ) : (
        <MemberSummary attempts={myAt} kind={a.kind} />
      )}
    </Modal>
  );
}

function MemberSummary({ attempts, kind }: { attempts: AttemptLite[]; kind: ClassAssignment['kind'] }) {
  if (!attempts.length) return <p className="text-sm text-muted">You haven&apos;t started this one yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-[4px] border border-line">
      {attempts.map((t) => (
        <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-muted">{formatDate(t.created_at, true)}</span>
          <span className={cn('tabular font-display font-bold', scoreTone(pct(t.correct, t.total)))}>
            {pct(t.correct, t.total)}% <span className="font-sans text-xs font-normal text-muted">{t.correct}/{t.total}{kind === 'deck' ? ' known' : ''}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[2px] border border-line bg-surface-2 px-3 py-2.5">

      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn('tabular mt-0.5 font-display text-xl font-extrabold text-heading sm:text-2xl', tone)}>{value}</div>
    </div>
  );
}
