import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Pill, SegmentedControl, Select, Textarea, errorMessage, useToast } from '../../../components/ui';
import { eventName, type AssignmentKind } from '../../../lib/types';
import {
  OFFICIAL_ASSIGNMENT_QUESTIONS,
  canManage,
  createAssignment,
  updateAssignment,
  type ClassAssignment,
  type ClassDeck,
  type ClassTest,
  type ClassroomContext,
} from '../../../api/classroom';
import { eventOptions, toLocalInput } from './classroom-shared';

export type AssignPreset = { kind: AssignmentKind; ref: string } | null;

function at(daysAhead: number, hour = 23, minute = 59) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const QUICK_DUES = [
  { label: 'Tomorrow', make: () => at(1) },
  { label: 'In 3 days', make: () => at(3) },
  { label: 'In a week', make: () => at(7) },
  { label: 'In 2 weeks', make: () => at(14) },
];

export function AssignModal({
  open,
  onClose,
  ctx,
  tests,
  decks,
  preset,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ctx: ClassroomContext;
  tests: ClassTest[];
  decks: ClassDeck[];
  preset?: AssignPreset;
  editing?: ClassAssignment | null;
  onSaved: (a: ClassAssignment, created: boolean) => void;
}) {
  const toast = useToast();
  const myTests = useMemo(() => tests.filter((t) => canManage(ctx, t.event) && t.questions.length > 0), [tests, ctx]);
  const myDecks = useMemo(() => decks.filter((d) => canManage(ctx, d.event) && d.cards.length > 0), [decks, ctx]);
  const evOpts = useMemo(() => eventOptions(ctx, { manageableOnly: true }), [ctx]);

  const [kind, setKind] = useState<AssignmentKind>('test');
  const [ref, setRef] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const autoTitle = (k: AssignmentKind, r: string) => {
    if (k === 'test') return tests.find((t) => t.id === r)?.title ?? '';
    if (k === 'deck') return decks.find((d) => d.id === r)?.title ?? '';
    return r ? `${eventName(r)} practice` : '';
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBusy(false);
    if (editing) {
      setKind(editing.kind);
      setRef(editing.ref);
      setTitle(editing.title);
      setTitleTouched(true);
      setInstructions(editing.instructions ?? '');
      setDue(editing.due_at ? toLocalInput(new Date(editing.due_at)) : '');
      return;
    }
    const k: AssignmentKind = preset?.kind ?? (myTests.length ? 'test' : myDecks.length ? 'deck' : 'official');
    const r = preset?.ref ?? (k === 'test' ? (myTests[0]?.id ?? '') : k === 'deck' ? (myDecks[0]?.id ?? '') : (evOpts[0]?.value ?? ''));
    setKind(k);
    setRef(r);
    setTitle(autoTitle(k, r));
    setTitleTouched(false);
    setInstructions('');
    setDue(toLocalInput(at(7)));
  }, [open, editing, preset]);

  const pickKind = (k: AssignmentKind) => {
    setKind(k);
    const r = k === 'test' ? (myTests[0]?.id ?? '') : k === 'deck' ? (myDecks[0]?.id ?? '') : (evOpts[0]?.value ?? '');
    setRef(r);
    if (!titleTouched) setTitle(autoTitle(k, r));
  };
  const pickRef = (r: string) => {
    setRef(r);
    if (!titleTouched) setTitle(autoTitle(kind, r));
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!ref) e.ref = kind === 'test' ? 'Pick a test.' : kind === 'deck' ? 'Pick a deck.' : 'Pick an event.';
    if (!title.trim()) e.title = 'Give the assignment a title.';
    if (due && new Date(due).getTime() < Date.now() - 60_000 && !editing) e.due = 'The due date is in the past.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const due_at = due ? new Date(due).toISOString() : null;
      const saved = editing
        ? await updateAssignment(editing.id, { title: title.trim(), instructions: instructions.trim() || null, due_at })
        : await createAssignment(ctx.chapter.id, { kind, ref, title, instructions, due_at });
      toast.success(editing ? 'Assignment updated' : 'Assigned', editing ? undefined : 'Every member has been notified.');
      onSaved(saved, !editing);
      onClose();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const kinds: AssignmentKind[] = ['test', 'deck', 'official'];

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="md"
      title={editing ? 'Edit assignment' : 'New assignment'}
      description={editing ? 'Change the title, instructions or due date.' : 'Every member of the chapter gets it on their to-do list.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Assign to chapter'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <SegmentedControl
            aria-label="What to assign"
            block
            size="sm"
            value={kind}
            onChange={pickKind}
            options={kinds.map((k) => {
              return { value: k, label: k === 'official' ? 'Official' : k === 'test' ? 'Test' : 'Deck' };
            })}
          />
        )}

        {!editing && kind === 'test' &&
          (myTests.length ? (
            <Select
              label="Chapter test"
              value={ref}
              onChange={(e) => pickRef(e.target.value)}
              error={errors.ref}
              options={myTests.map((t) => ({
                value: t.id,
                label: `${t.title} · ${t.questions.length} q${t.event ? ` · ${eventName(t.event)}` : ''}${t.published ? '' : ' (draft)'}`,
              }))}
              hint="Assigning a draft publishes it."
            />
          ) : (
            <Empty text="You have no tests with questions yet. Build one in the Library tab first." />
          ))}

        {!editing && kind === 'deck' &&
          (myDecks.length ? (
            <Select
              label="Flashcard deck"
              value={ref}
              onChange={(e) => pickRef(e.target.value)}
              error={errors.ref}
              options={myDecks.map((d) => ({ value: d.id, label: `${d.title} · ${d.cards.length} cards` }))}
            />
          ) : (
            <Empty text="You have no decks yet. Make one in the Library tab first." />
          ))}

        {!editing && kind === 'official' && (
          <Select
            label="Event"
            value={ref}
            onChange={(e) => pickRef(e.target.value)}
            error={errors.ref}
            options={evOpts}
            hint={`${OFFICIAL_ASSIGNMENT_QUESTIONS} official questions in exam mode, new ones first for each member.`}
          />
        )}

        <Input
          label="Title"
          value={title}
          maxLength={120}
          error={errors.title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
        />
        <Textarea
          label="Instructions (optional)"
          value={instructions}
          maxLength={2000}
          rows={3}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Do it in one sitting with no notes. We'll go over the hardest ones on Thursday."
        />
        <div>
          <Input
            label="Due"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            error={errors.due}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_DUES.map((q) => (
              <Pill key={q.label} className="h-7 px-3 text-xs" onClick={() => setDue(toLocalInput(q.make()))}>
                {q.label}
              </Pill>
            ))}
            <Pill className="h-7 px-3 text-xs" active={!due} onClick={() => setDue('')}>
              No due date
            </Pill>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-[2px] border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm text-muted">{text}</p>;
}
