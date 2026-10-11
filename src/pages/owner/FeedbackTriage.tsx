// Feedback triage: every report students send (Send feedback, Report this question), newest high-priority first.
// Changing a status, priority or note goes through fbla_owner_feedback_update, which writes an audit row. The note
// is shown to the student who sent the report, so it is written for them. A question report shows the question with
// its answer key (fbla_owner_question) so the owner can check the report without leaving the console.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Badge, Button, EmptyState, Pill, SegmentedControl, Select, Skeleton, Textarea, useToast } from '../../components/ui';
import { cn } from '../../components/ui/cn';
import { revealInRow } from '../../components/ui/scrollFade';
import type { FeedbackFilter, FeedbackSaved, OwnerFeedbackRow } from '../../api/owner';
import {
  KIND_LABELS,
  STATUS_LABELS,
  triageFilters,
  triageSaved,
  type FeedbackKind,
  type FeedbackPriority,
  type FeedbackStatus,
} from '../../lib/feedback';
import { DIFFICULTY_LABELS, eventName, type Difficulty } from '../../lib/types';
import { LoadState, MoreButton, useLoad, useOwnerSource, usePaged, when } from './shared';

const FILTERS: { value: FeedbackFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wontfix', label: "Won't fix" },
  { value: 'all', label: 'All' },
];

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  ...(Object.keys(KIND_LABELS) as FeedbackKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })),
];

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }));

const PRIORITY_OPTIONS: { value: FeedbackPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const PAGE = 50;
const rowId = (r: OwnerFeedbackRow) => r.id;

type Draft = { status: FeedbackStatus; priority: FeedbackPriority; note: string };
// Unsaved triage edits, by report id. Kept at module level so a half-written note survives picking another report,
// changing a filter or switching console sections; a page reload drops them.
const drafts = new Map<string, Draft>();
const NO_PROFILE = 'Account without a profile';

export function FeedbackTriage({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const toast = useToast();
  // Filters live in the URL (?status=&kind=), so Content's reported questions and status counts can open this view
  // filtered, and a refresh keeps it. ?question= picks that question's first report once the list arrives.
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => triageFilters(params));
  const [status, setStatusState] = useState<FeedbackFilter>(initial.status);
  const [kind, setKindState] = useState<FeedbackKind | ''>(initial.kind);
  const wantQuestion = useRef(initial.question);
  const setFilter = (next: { status?: FeedbackFilter; kind?: FeedbackKind | '' }) => {
    if (next.status !== undefined) setStatusState(next.status);
    if (next.kind !== undefined) setKindState(next.kind);
    wantQuestion.current = null;
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (next.status !== undefined) q.set('status', next.status);
        if (next.kind !== undefined) {
          if (next.kind) q.set('kind', next.kind);
          else q.delete('kind');
        }
        q.delete('question');
        return q;
      },
      { replace: true },
    );
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Re-renders the list when a report gains or loses unsaved edits, so its row can say so.
  const [, draftsChanged] = useReducer((n: number) => n + 1, 0);
  // On a phone the status pills scroll sideways: keep the chosen one in view, also when it came from a link.
  const statusRow = useRef<HTMLDivElement>(null);
  const statusPlaced = useRef(false);
  useLayoutEffect(() => {
    revealInRow(statusRow.current, statusRow.current?.querySelector<HTMLElement>('[aria-pressed="true"]'), !statusPlaced.current);
    statusPlaced.current = true;
  }, [status]);
  // The open report as last seen, so it stays open after a save moves it out of the current filter.
  const [snap, setSnap] = useState<OwnerFeedbackRow | null>(null);
  const state = usePaged(
    (offset) => src.feedbackList({ status, kind: kind || null, limit: PAGE, offset }),
    `fb:${status}:${kind}:${refreshKey}`,
    rowId,
  );
  // On a phone the list hides while a report is open; going back puts focus on the row that was open.
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId || !returnTo.current) return;
    document.getElementById(`fb-row-${returnTo.current}`)?.focus();
    returnTo.current = null;
  }, [selectedId]);

  const rows = state.rows;
  // Arriving from a reported question: open its first report on the list (if it is on the first page), once.
  useEffect(() => {
    const q = wantQuestion.current;
    if (!q || state.loading || !state.data) return;
    wantQuestion.current = null;
    const hit = rows.find((r) => r.question_id === q);
    if (hit) {
      setSelectedId(hit.id);
      setSnap(hit);
    }
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('question');
        return n;
      },
      { replace: true },
    );
  }, [rows, state.loading, state.data, setParams]);
  // The list's copy wins once it is at least as new as the saved one (the reload after a save lands a moment later).
  const listed = rows.find((r) => r.id === selectedId);
  const fresh = snap && snap.id === selectedId && (!listed || snap.updated_at >= listed.updated_at) ? snap : null;
  const selected = fresh ?? listed ?? null;
  const counts = state.data?.counts;
  const countFor = (f: FeedbackFilter) => {
    if (!counts) return undefined;
    if (f === 'open') return counts.new + counts.triaged + counts.in_progress;
    if (f === 'all') return Object.values(counts).reduce((a, b) => a + b, 0);
    return counts[f];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          ref={statusRow}
          className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0"
          role="group"
          aria-label="Status"
        >
          {FILTERS.map((f) => (
            <Pill
              key={f.value}
              active={status === f.value}
              onClick={() => setFilter({ status: f.value })}
              count={countFor(f.value)}
            >
              {f.label}
            </Pill>
          ))}
        </div>
        <Select
          aria-label="Kind"
          className="w-full lg:w-48"
          value={kind}
          onChange={(e) => setFilter({ kind: e.target.value as FeedbackKind | '' })}
          options={KIND_OPTIONS}
        />
      </div>

      <LoadState state={state} skeleton="table">
        {() =>
          rows.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={status === 'open' ? 'Nothing waiting' : 'No feedback here'}
              description={status === 'open' ? 'Every report has been handled. New ones land here first.' : 'Try another status or kind.'}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className={cn('min-w-0', selected && 'hidden lg:block')}>
                <ul className="divide-y divide-line border border-line bg-surface" aria-label="Feedback">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        id={`fb-row-${r.id}`}
                        onClick={() => {
                          setSelectedId(r.id);
                          setSnap(r);
                        }}
                        aria-current={r.id === selectedId ? 'true' : undefined}
                        className={cn(
                          'block w-full scroll-mt-24 px-4 py-3 text-left transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/40',
                          r.id === selectedId && 'bg-red/[0.04] shadow-[inset_3px_0_0_var(--red)]',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <KindBadge kind={r.kind} />
                          {r.priority === 'high' && <Badge tone="red">High</Badge>}
                          {r.priority === 'low' && <Badge>Low</Badge>}
                          <StatusBadge status={r.status} />
                          {drafts.has(r.id) && <span className="text-xs font-semibold text-warning">Unsaved changes</span>}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink">{r.message}</p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {r.username ? `@${r.username}` : NO_PROFILE} · {when(r.created_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                <MoreButton state={state} />
              </div>
              <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
                {selected ? (
                  <FeedbackDetail
                    key={selected.id}
                    row={selected}
                    onDraftChange={draftsChanged}
                    onBack={() => {
                      returnTo.current = selected.id;
                      setSelectedId(null);
                    }}
                    onSaved={(changed, saved) => {
                      setSnap({ ...selected, ...saved });
                      const t = triageSaved(changed);
                      toast.success(t.title, t.body);
                      state.reload();
                    }}
                  />
                ) : (
                  <div className="grid h-full min-h-48 place-items-center border border-dashed border-line-strong p-6 text-center text-sm text-muted">
                    Pick a report to read it and set its status.
                  </div>
                )}
              </div>
            </div>
          )
        }
      </LoadState>
    </div>
  );
}

function KindBadge({ kind }: { kind: FeedbackKind }) {
  return <Badge tone={kind === 'bug' || kind === 'question_issue' ? 'navy' : 'blue'}>{KIND_LABELS[kind]}</Badge>;
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const tone = status === 'new' ? 'red' : status === 'resolved' ? 'success' : status === 'wontfix' ? 'neutral' : 'warning';
  return (
    <Badge tone={tone} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

type Changed = { status?: FeedbackStatus; priority?: FeedbackPriority; note?: string };

export function FeedbackDetail({
  row,
  onBack,
  onSaved,
  onDraftChange,
}: {
  row: OwnerFeedbackRow;
  onBack: () => void;
  onSaved: (changed: Changed, saved: FeedbackSaved) => void;
  onDraftChange?: () => void;
}) {
  const src = useOwnerSource();
  const toast = useToast();
  // On a phone, opening a report hides the list, so focus moves to the report instead of being dropped.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) ref.current?.focus();
  }, []);
  // Picks up where an unsaved edit of this report left off.
  const [draft] = useState(() => drafts.get(row.id));
  const [status, setStatus] = useState<FeedbackStatus>(draft?.status ?? row.status);
  const [priority, setPriority] = useState<FeedbackPriority>(draft?.priority ?? row.priority);
  const [note, setNote] = useState(draft?.note ?? row.resolution_note ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = status !== row.status || priority !== row.priority || note.trim() !== (row.resolution_note ?? '');
  // Keep unsaved edits while another report is open; a save (or undoing the edit) clears them.
  useEffect(() => {
    const had = drafts.has(row.id);
    if (dirty) drafts.set(row.id, { status, priority, note });
    else drafts.delete(row.id);
    if (had !== dirty) onDraftChange?.();
  }, [row.id, dirty, status, priority, note, onDraftChange]);
  const tooLong = note.trim().length > 1000;

  const save = async () => {
    setBusy(true);
    const changed: Changed = {
      status: status !== row.status ? status : undefined,
      priority: priority !== row.priority ? priority : undefined,
      note: note.trim() !== (row.resolution_note ?? '') ? note.trim() : undefined,
    };
    try {
      const saved = await src.feedbackUpdate(row.id, { status: changed.status, priority: changed.priority, resolution_note: changed.note });
      onSaved(changed, saved);
    } catch (e) {
      toast.error('Could not save', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article ref={ref} tabIndex={-1} className="scroll-mt-24 border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-blue/40" aria-label="Feedback detail">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={onBack} leftIcon={<ArrowLeft className="size-4" />}>
          All feedback
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={row.kind} />
          <StatusBadge status={row.status} />
        </div>
      </div>
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink">{row.message}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">From</dt>
          <dd className="min-w-0 truncate text-ink">
            {row.username ? (
              <>
                {row.display_name} <span className="text-muted">@{row.username}</span>
              </>
            ) : (
              NO_PROFILE
            )}
          </dd>
          <dt className="text-muted">Sent</dt>
          <dd className="text-ink">{when(row.created_at)}</dd>
          {row.page_path && (
            <>
              <dt className="text-muted">Page</dt>
              <dd className="min-w-0 truncate font-mono text-xs leading-5 text-ink">{row.page_path}</dd>
            </>
          )}
          {row.question_id && (
            <>
              <dt className="text-muted">Question</dt>
              <dd className="text-ink">
                <code className="font-mono text-xs font-semibold">{row.question_id}</code>
                {row.question_event && <span className="text-muted"> · {eventName(row.question_event)}</span>}
              </dd>
            </>
          )}
          {row.resolved_at && (
            <>
              <dt className="text-muted">Closed</dt>
              <dd className="text-ink">{when(row.resolved_at)}</dd>
            </>
          )}
        </dl>

        {row.question_id && !row.question_id.startsWith('custom:') && <QuestionCheck id={row.question_id} />}

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} options={STATUS_OPTIONS} />
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink" id={`prio-${row.id}`}>
              Priority
            </div>
            <SegmentedControl aria-label="Priority" block value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          </div>
        </div>
        <Textarea
          label="Note to the student"
          hint="Shown with the status on their Send feedback screen. Leave empty for none."
          error={tooLong ? 'Keep it under 1,000 characters.' : undefined}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1200}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && !busy && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatus(row.status);
                setPriority(row.priority);
                setNote(row.resolution_note ?? '');
              }}
            >
              Discard changes
            </Button>
          )}
          <Button variant="accent" onClick={save} disabled={!dirty || tooLong} loading={busy}>
            Save changes
          </Button>
        </div>
      </div>
    </article>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** The reported question with its answer key and explanation, so a report can be checked on the spot. */
function QuestionCheck({ id }: { id: string }) {
  const src = useOwnerSource();
  const state = useLoad(() => src.question(id), `question:${id}`, { quiet: true });
  const gone = (state.error as { code?: string } | null)?.code === 'P0002';
  return (
    <section aria-label="Reported question" className="border border-line bg-surface-2/60 p-4">
      <h3 className="text-sm font-bold text-heading">The question</h3>
      {state.error ? (
        gone ? (
          <p className="mt-1 text-sm text-muted">This question is no longer in the bank.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">Could not load the question.</p>
            <Button variant="outline" size="sm" onClick={state.reload}>
              Try again
            </Button>
          </div>
        )
      ) : !state.data ? (
        <div className="mt-2 space-y-2" role="status" aria-label="Loading the question">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-muted">
            {[eventName(state.data.event), state.data.area, DIFFICULTY_LABELS[state.data.difficulty as Difficulty]].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{state.data.question}</p>
          <ol className="mt-3 space-y-1.5" aria-label="Choices">
            {state.data.choices.map((choice, i) => {
              const keyed = i === state.data!.answer;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2.5 border px-3 py-2 text-sm',
                    keyed ? 'border-success bg-success/[0.07]' : 'border-line bg-surface',
                  )}
                >
                  <span className="tabular w-4 shrink-0 font-bold text-muted">{LETTERS[i] ?? i + 1}</span>
                  <span className="min-w-0 flex-1 text-ink">{choice}</span>
                  {keyed && <Badge tone="success">Answer key</Badge>}
                </li>
              );
            })}
          </ol>
          {state.data.explanation && (
            <div className="mt-3 text-sm">
              <div className="font-semibold text-heading">Explanation</div>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-ink">{state.data.explanation}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
