// "Send feedback" (account menu) and "Report this question" (exam review). Both write a row to fbla_feedback
// (0103) that only the sender and the site owners can read. The page path goes with it (no query string, and ids or
// invite tokens replaced by their route name), never answers or anything else about the student. "Your reports" shows
// each report's status, in plain words, and the team's note.
import { useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Badge, Button, Modal, SegmentedControl, Textarea, useToast } from '../ui';
import { cn } from '../ui/cn';
import { listMyFeedback, sendFeedback, type MyFeedback } from '../../api/feedback';
import {
  cleanPagePath,
  composeReport,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  feedbackProblem,
  KIND_LABELS,
  pageLabel,
  REPORT_REASONS,
  STUDENT_STATUS_LABELS,
  type FeedbackKind,
  type ReportReason,
} from '../../lib/feedback';

type View = 'write' | 'mine';

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { pathname } = useLocation();
  const [view, setView] = useState<View>('write');
  const [kind, setKind] = useState<Exclude<FeedbackKind, 'question_issue'>>('bug');
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mineKey, setMineKey] = useState(0);
  // How many reports "Your reports" found (null while loading or after an error), for the footer's wording.
  const [mineCount, setMineCount] = useState<number | null>(null);
  const problem = feedbackProblem(message);
  const page = cleanPagePath(pathname);
  const where = pageLabel(page);
  const fieldId = useId();

  useEffect(() => {
    if (!open) return;
    setView('write');
    setTried(false);
  }, [open]);

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    try {
      await sendFeedback({ kind, message, pagePath: page });
      toast.success('Thanks, it reached the team', 'You can follow it under Your reports.');
      setMessage('');
      setTried(false);
      setMineKey((k) => k + 1);
      setView('mine');
    } catch (e) {
      toast.error('Could not send that', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Send feedback"
      description="Something broken, confusing or missing? The people who run the site read every report."
      footer={
        view === 'write' ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="accent" onClick={submit} loading={busy}>
              Send
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setView('write')}>
            {mineCount === 0 ? 'Write one' : mineCount ? 'Write another' : 'Write feedback'}
          </Button>
        )
      }
    >
      <SegmentedControl
        block
        size="sm"
        aria-label="Feedback view"
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'mine', label: 'Your reports' },
        ]}
      />
      {view === 'write' ? (
        <div className="space-y-4">
          <ChoiceList
            legend="What is it about?"
            value={kind}
            onChange={setKind}
            options={FEEDBACK_KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))}
          />
          <div>
            <Textarea
              id={fieldId}
              label="What happened?"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={FEEDBACK_MAX + 200}
              error={tried ? problem : undefined}
              aria-describedby={[tried && problem ? `${fieldId}-err` : null, `${fieldId}-privacy`].filter(Boolean).join(' ')}
              corner={<span className={cn('tabular', message.trim().length > FEEDBACK_MAX && 'text-danger')}>{message.trim().length}/2,000</span>}
            />
            {/* Its own line, so a validation error never hides it. */}
            <p id={`${fieldId}-privacy`} className="mt-1.5 text-[0.8125rem] text-muted">
              {where ? `Sent with the page you're on (${where}).` : "Sent with the page you're on."} Don't include passwords
              or personal details.
            </p>
          </div>
        </div>
      ) : (
        <MyReports refreshKey={mineKey} onCount={setMineCount} />
      )}
    </Modal>
  );
}

function MyReports({ refreshKey, onCount }: { refreshKey: number; onCount: (n: number | null) => void }) {
  const [state, setState] = useState<{ rows: MyFeedback[] | null; error: boolean }>({ rows: null, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ rows: null, error: false });
    onCount(null);
    listMyFeedback()
      .then((rows) => {
        if (!live) return;
        setState({ rows, error: false });
        onCount(rows.length);
      })
      .catch(() => live && setState({ rows: null, error: true }));
    return () => {
      live = false;
    };
  }, [refreshKey, retry, onCount]);

  if (state.error)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted">Your reports could not be loaded right now.</p>
        <Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  if (!state.rows) return <p className="py-6 text-center text-sm text-muted" role="status">Loading your reports...</p>;
  if (!state.rows.length) return <p className="py-6 text-center text-sm text-muted">You haven't sent any feedback yet.</p>;
  return (
    <ul className="divide-y divide-line border border-line">
      {state.rows.map((r) => (
        <li key={r.id} className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge>{KIND_LABELS[r.kind]}</Badge>
            <Badge tone={r.status === 'resolved' ? 'success' : r.status === 'new' ? 'blue' : 'neutral'} dot>
              {STUDENT_STATUS_LABELS[r.status]}
            </Badge>
            <span className="text-muted">{new Date(r.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
          </div>
          <p className="mt-1.5 line-clamp-3 text-sm text-ink">{r.message}</p>
          {r.resolution_note && (
            <div className="mt-2 rounded-none border border-line bg-surface-2 px-3 py-2 text-sm">
              <div className="text-xs font-semibold text-heading">From the team</div>
              <p className="mt-0.5 text-ink">{r.resolution_note}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Native radio buttons laid out as rows: keyboard and screen reader behaviour for free. */
function ChoiceList<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-ink">{legend}</legend>
      <div className="divide-y divide-line border border-line">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2/70',
              value === o.value && 'bg-red/[0.04] shadow-[inset_3px_0_0_var(--red)]',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-1 size-4 shrink-0 accent-[var(--red)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------------------------------------ question reports

export function ReportQuestionDialog({ questionId, onClose }: { questionId: string | null; onClose: () => void }) {
  const toast = useToast();
  const { pathname } = useLocation();
  const [reason, setReason] = useState<ReportReason>('wrong_key');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const message = composeReport(reason, details);
  const problem = feedbackProblem(message);

  useEffect(() => {
    if (!questionId) return;
    setReason('wrong_key');
    setDetails('');
  }, [questionId]);

  const submit = async () => {
    if (!questionId || problem) return;
    setBusy(true);
    try {
      await sendFeedback({ kind: 'question_issue', message, pagePath: pathname, questionId });
      toast.success('Thanks for the report', "We'll check this question. Follow it in Send feedback, under Your reports.");
      onClose();
    } catch (e) {
      toast.error('Could not send the report', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!questionId}
      onClose={busy ? () => {} : onClose}
      title="Report this question"
      description={questionId ? `Question ${questionId}. The site team checks every report.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} loading={busy} disabled={!!problem}>
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ChoiceList legend="What's wrong?" value={reason} onChange={setReason} options={REPORT_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
        <Textarea
          label="Details (optional)"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1800}
          error={problem && details.trim() ? problem : undefined}
          hint="For example, which answer you think is right and why."
        />
      </div>
    </Modal>
  );
}

/** State plus dialog for "Report this question": spread `onReport` into ExamResults and render `dialog`. */
export function useQuestionReport() {
  const [questionId, setQuestionId] = useState<string | null>(null);
  return {
    onReport: (id: string) => setQuestionId(id),
    dialog: <ReportQuestionDialog questionId={questionId} onClose={() => setQuestionId(null)} />,
  };
}
