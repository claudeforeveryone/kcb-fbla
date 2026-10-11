// Feedback triage: every report students send (Send feedback, Report this question), newest high-priority first.
// Changing a status, priority or note goes through fbla_owner_feedback_update, which writes an audit row. The note
// is shown to the student who sent the report, so it is written for them.
import { useEffect, useState } from 'react';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Badge, Button, EmptyState, Pill, SegmentedControl, Select, Textarea, useToast } from '../../components/ui';
import { cn } from '../../components/ui/cn';
import type { FeedbackFilter, OwnerFeedbackRow } from '../../api/owner';
import {
  KIND_LABELS,
  STATUS_LABELS,
  type FeedbackKind,
  type FeedbackPriority,
  type FeedbackStatus,
} from '../../lib/feedback';
import { eventName } from '../../lib/types';
import { LoadState, useLoad, useOwnerSource, when } from './shared';

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

export function FeedbackTriage({ refreshKey }: { refreshKey: number }) {
  const src = useOwnerSource();
  const toast = useToast();
  const [status, setStatus] = useState<FeedbackFilter>('open');
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const state = useLoad(
    () => src.feedbackList({ status, kind: kind || null, limit }),
    `fb:${status}:${kind}:${limit}:${refreshKey}:${bump}`,
  );

  useEffect(() => setLimit(PAGE), [status, kind]);

  const rows = state.data?.rows ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;
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
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <Pill key={f.value} active={status === f.value} onClick={() => setStatus(f.value)} count={countFor(f.value)}>
              {f.label}
            </Pill>
          ))}
        </div>
        <Select
          aria-label="Kind"
          className="w-full lg:w-48"
          value={kind}
          onChange={(e) => setKind(e.target.value as FeedbackKind | '')}
          options={KIND_OPTIONS}
        />
      </div>

      <LoadState state={state} skeleton="table">
        {(d) =>
          d.rows.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={status === 'open' ? 'Nothing waiting' : 'No feedback here'}
              description={status === 'open' ? 'Every report has been handled. New ones land here first.' : 'Try another status or kind.'}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className={cn('min-w-0', selected && 'hidden lg:block')}>
                <ul className="divide-y divide-line border border-line bg-surface" aria-label="Feedback">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-current={r.id === selectedId ? 'true' : undefined}
                        className={cn(
                          'block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/40',
                          r.id === selectedId && 'bg-red/[0.04] shadow-[inset_3px_0_0_var(--red)]',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <KindBadge kind={r.kind} />
                          {r.priority === 'high' && <Badge tone="red">High</Badge>}
                          {r.priority === 'low' && <Badge>Low</Badge>}
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink">{r.message}</p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {r.username ? `@${r.username}` : 'Deleted account'} · {when(r.created_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                {d.total > d.rows.length && (
                  <Button variant="outline" size="sm" block className="mt-3" onClick={() => setLimit((l) => l + PAGE)} loading={state.loading}>
                    Show more ({d.total - d.rows.length} left)
                  </Button>
                )}
              </div>
              <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
                {selected ? (
                  <FeedbackDetail
                    key={selected.id}
                    row={selected}
                    onBack={() => setSelectedId(null)}
                    onSaved={() => {
                      toast.success('Saved', 'The student sees the new status.');
                      setBump((n) => n + 1);
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

export function FeedbackDetail({ row, onBack, onSaved }: { row: OwnerFeedbackRow; onBack: () => void; onSaved: () => void }) {
  const src = useOwnerSource();
  const toast = useToast();
  const [status, setStatus] = useState<FeedbackStatus>(row.status);
  const [priority, setPriority] = useState<FeedbackPriority>(row.priority);
  const [note, setNote] = useState(row.resolution_note ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = status !== row.status || priority !== row.priority || note.trim() !== (row.resolution_note ?? '');
  const tooLong = note.trim().length > 1000;

  const save = async () => {
    setBusy(true);
    try {
      await src.feedbackUpdate(row.id, {
        status: status !== row.status ? status : undefined,
        priority: priority !== row.priority ? priority : undefined,
        resolution_note: note.trim() !== (row.resolution_note ?? '') ? note.trim() : undefined,
      });
      onSaved();
    } catch (e) {
      toast.error('Could not save', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="border border-line bg-surface" aria-label="Feedback detail">
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
              'Deleted account'
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
        <div className="flex justify-end">
          <Button variant="accent" onClick={save} disabled={!dirty || tooLong} loading={busy}>
            Save changes
          </Button>
        </div>
      </div>
    </article>
  );
}
