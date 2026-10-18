import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Pill,
  Select,
  Skeleton,
  SkeletonCards,
  Spinner,
  Switch,
  Textarea,
  cn,
  errorMessage,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { loadQuestions, type Question } from '../../lib/content';
import { applyKeys, getBankKeys } from '../../api/keys';
import { DIFFICULTY_LABELS, eventName, type CustomQuestion } from '../../lib/types';
import {
  MAX_TEST_QUESTIONS,
  canManage,
  customTestHref,
  getCustomTest,
  isAdmin,
  loadClassroomContext,
  saveCustomTest,
  type ClassTest,
  type ClassroomContext,
} from '../../api/classroom';
import { AssignModal } from './components/classroom-assign-modal';
import { eventOptions, pluralize, timeAgo } from './components/classroom-shared';

/** Editor row: a custom question plus a stable key and, for imported ones, the official id it came from. */
type EQ = { key: number; q: string; choices: [string, string, string, string]; answer: number | null; explain: string; sub: string; src: string | null };
let keySeq = 0;
const LETTERS = ['A', 'B', 'C', 'D'];

const blank = (): EQ => ({ key: ++keySeq, q: '', choices: ['', '', '', ''], answer: null, explain: '', sub: '', src: null });
function fromStored(q: CustomQuestion & { src?: string | null }): EQ {
  const c = [...q.choices, '', '', '', ''].slice(0, 4) as EQ['choices'];
  return { key: ++keySeq, q: q.q, choices: c, answer: q.answer, explain: q.explain ?? '', sub: q.sub ?? '', src: q.src ?? null };
}
function fromOfficial(q: Question): EQ {
  const c = [...q.choices, '', '', '', ''].slice(0, 4) as EQ['choices'];
  return { key: ++keySeq, q: q.q, choices: c, answer: q.answer ?? null, explain: q.explain ?? '', sub: q.sub ?? '', src: q.id };
}
function toStored(e: EQ): CustomQuestion & { src?: string } {
  return {
    q: e.q.trim(),
    choices: e.choices.map((c) => c.trim()),
    answer: e.answer ?? 0,
    explain: e.explain.trim() || null,
    sub: e.sub.trim() || null,
    ...(e.src ? { src: e.src } : {}),
  };
}
function problems(e: EQ): string[] {
  const out: string[] = [];
  if (!e.q.trim()) out.push('question text');
  const empty = e.choices.filter((c) => !c.trim()).length;
  if (empty) out.push(`${empty} empty choice${empty === 1 ? '' : 's'}`);
  if (e.answer == null) out.push('correct answer');
  const trimmed = e.choices.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (new Set(trimmed).size !== trimmed.length) out.push('duplicate choices');
  return out;
}
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Meta = { title: string; description: string; event: string; timed: boolean; minutes: string; shuffle: boolean };

export default function TestEditorPage() {
  const { testId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ctx, setCtx] = useState<ClassroomContext | null>(null);
  const [test, setTest] = useState<ClassTest | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'forbidden' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);

  const [meta, setMeta] = useState<Meta>({ title: '', description: '', event: '', timed: false, minutes: '20', shuffle: true });
  const [qs, setQs] = useState<EQ[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<EQ | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [c, t] = await Promise.all([loadClassroomContext(), getCustomTest(testId)]);
      setCtx(c);
      if (!t || !c || t.chapter_id !== c.chapter.id) return setState('missing');
      setTest(t);
      if (!canManage(c, t.event)) return setState('forbidden');
      setMeta({
        title: t.title,
        description: t.description ?? '',
        event: t.event ?? '',
        timed: !!t.time_limit_sec,
        minutes: t.time_limit_sec ? String(Math.round(t.time_limit_sec / 60)) : String(Math.max(5, Math.min(120, Math.ceil(t.questions.length * 0.5) || 20))),
        shuffle: t.shuffle,
      });
      const rows = t.questions.map((q) => fromStored(q as CustomQuestion & { src?: string }));
      setQs(rows);
      setOpen(rows.length ? null : -1);
      setDirty(false);
      setState('ready');
    } catch (e) {
      setError(e);
      setState('error');
    }
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const touch = () => setDirty(true);
  const patchMeta = (p: Partial<Meta>) => {
    setMeta((m) => ({ ...m, ...p }));
    touch();
  };
  const patchQ = (key: number, p: Partial<EQ>) => {
    setQs((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
    touch();
  };
  const move = (i: number, d: -1 | 1) => {
    setQs((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    touch();
  };
  const addBlank = () => {
    if (qs.length >= MAX_TEST_QUESTIONS) return toast.warning(`A test can have at most ${MAX_TEST_QUESTIONS} questions.`);
    const b = blank();
    setQs((xs) => [...xs, b]);
    setOpen(b.key);
    touch();
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const duplicate = (i: number) => {
    if (qs.length >= MAX_TEST_QUESTIONS) return toast.warning(`A test can have at most ${MAX_TEST_QUESTIONS} questions.`);
    setQs((xs) => {
      const c = { ...xs[i], key: ++keySeq, choices: [...xs[i].choices] as EQ['choices'] };
      const n = [...xs];
      n.splice(i + 1, 0, c);
      setOpen(c.key);
      return n;
    });
    touch();
  };

  const invalid = useMemo(() => qs.map((q, i) => ({ i, p: problems(q) })).filter((x) => x.p.length), [qs]);
  const minutes = Number(meta.minutes);
  const timeError = meta.timed && (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) ? 'Between 1 and 240 minutes.' : undefined;

  const save = useCallback(
    async (opts: { publish?: boolean } = {}) => {
      if (!test || !ctx) return null;
      if (!meta.title.trim()) {
        toast.error('Give the test a name first.');
        return null;
      }
      if (timeError) {
        toast.error('Check the time limit.', timeError);
        return null;
      }
      const publish = opts.publish ?? test.published;
      if (invalid.length) {
        setShowErrors(true);
        setOpen(qs[invalid[0].i].key);
        toast.error(
          `${pluralize(invalid.length, 'question')} ${invalid.length === 1 ? 'needs' : 'need'} finishing`,
          `Question ${invalid[0].i + 1} is missing ${invalid[0].p.join(', ')}.`,
        );
        return null;
      }
      if (publish && !qs.length) {
        toast.error('Add at least one question before publishing.');
        return null;
      }
      setSaving(true);
      try {
        const stored = qs.map(toStored);
        const saved = await saveCustomTest(test.id, {
          title: meta.title.trim(),
          description: meta.description.trim() || null,
          event: meta.event || null,
          time_limit_sec: meta.timed ? Math.round(minutes * 60) : null,
          shuffle: meta.shuffle,
          questions: stored,
          source: stored.length && stored.every((q) => q.src) ? 'copied' : 'custom',
          published: publish,
        });
        setTest(saved);
        setDirty(false);
        setShowErrors(false);
        if (opts.publish != null && opts.publish !== test.published) {
          toast.success(opts.publish ? 'Published' : 'Moved back to drafts', opts.publish ? 'Members can now take it from the classroom library.' : 'Members no longer see it.');
        } else {
          toast.success('Saved');
        }
        return saved;
      } catch (e) {
        toast.error('Could not save', errorMessage(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [test, ctx, meta, qs, invalid, minutes, timeError, toast],
  );

  // Cmd/Ctrl + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  // ------------------------------------------------------------------ states
  if (state === 'loading')
    return (
      <>
        <PageHeader back={{ to: '/chapter/classroom?tab=library', label: 'Classroom' }} eyebrow="Test editor" title={<Skeleton className="h-9 w-72 bg-white/20" />} />
        <Page>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <SkeletonCards count={3} />
            <Skeleton className="hidden h-80 lg:block" />
          </div>
        </Page>
      </>
    );
  if (state === 'error')
    return (
      <>
        <PageHeader back={{ to: '/chapter/classroom?tab=library', label: 'Classroom' }} title="Test editor" />
        <Page>
          <ErrorState error={error} onRetry={() => void load()} />
        </Page>
      </>
    );
  if (state === 'missing' || state === 'forbidden' || !test || !ctx)
    return (
      <>
        <PageHeader back={{ to: '/chapter/classroom?tab=library', label: 'Classroom' }} title="Test editor" />
        <Page width="narrow">
          <EmptyState
            title={state === 'forbidden' ? 'You can’t edit this test' : 'Test not found'}
            description={
              state === 'forbidden'
                ? `Only executives and the ${test?.event ? eventName(test.event) : ''} trainers can change it.`
                : 'It may have been deleted, or it belongs to another chapter.'
            }
            action={
              <>
                {state === 'forbidden' && test?.published && <ButtonLink to={customTestHref(test.id)}>Take the test</ButtonLink>}
                <ButtonLink to="/chapter/classroom?tab=library" variant="outline">
                  Back to the library
                </ButtonLink>
              </>
            }
          />
        </Page>
      </>
    );

  const admin = isAdmin(ctx);
  const imported = new Set(qs.map((q) => q.src).filter(Boolean) as string[]);

  return (
    <>
      <PageHeader
        back={{ to: '/chapter/classroom?tab=library', label: 'Classroom' }}
        eyebrow={
          <span className="flex items-center gap-2">
            Test editor
            {test.published ? (
              <span className="rounded-none bg-success px-2 py-0.5 text-[10px] tracking-wider text-white">Published</span>
            ) : (
              <span className="rounded-none bg-warning px-2 py-0.5 text-[10px] tracking-wider text-white">Draft</span>
            )}
          </span>
        }
        title={meta.title || 'Untitled test'}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{pluralize(qs.length, 'question')}</span>
            {meta.event && <span>{eventName(meta.event)}</span>}
            {meta.timed && !timeError && <span>{minutes} min</span>}
            <span className="text-white/60">{dirty ? 'Unsaved changes' : `Saved ${timeAgo(test.updated_at)}`}</span>
          </span>
        }
        actions={
          <>
            {test.published && (
              <ButtonLink to={customTestHref(test.id)} variant="inverse" onClick={(e) => {
                  if (!dirty) return;
                  e.preventDefault();
                  toast.warning('Save first', 'Try-outs use the saved version.');
                }}>
                Try it
              </ButtonLink>
            )}
            <Button variant="accent" loading={saving} disabled={!dirty} onClick={() => void save()}>
              {dirty ? 'Save' : 'Saved'}
            </Button>
          </>
        }
      />

      <Page>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {/* ------------------------------------------------------------ questions */}
          <div className="min-w-0 lg:order-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-xl font-bold">Questions</h2>
              <Button variant="outline" size="sm" onClick={() => setImporting(true)} disabled={!meta.event} title={meta.event ? undefined : 'Pick an event to import from'}>
                Import from bank
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Shuffle className="size-4" />}
                disabled={qs.length < 2}
                onClick={() => {
                  setQs((xs) => shuffled(xs));
                  touch();
                  toast.info('Question order shuffled', 'Save to keep it.');
                }}
              >
                Shuffle order
              </Button>
            </div>

            {showErrors && invalid.length > 0 && (
              <div className="mb-4 rounded-none border border-line border-l-4 border-l-red bg-surface px-4 py-3 text-sm" role="alert">
                <div>
                  <p className="font-semibold text-ink">{pluralize(invalid.length, 'question')} to finish before saving</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {invalid.slice(0, 12).map((x) => (
                      <button key={x.i} type="button" className="rounded-none bg-surface px-2 py-0.5 text-xs font-semibold text-red ring-1 ring-red/30 hover:bg-surface-2 dark:text-danger" onClick={() => {
                        setOpen(qs[x.i].key);
                        document.getElementById(`q-${qs[x.i].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}>
                        Q{x.i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {qs.length ? (
              <ol className="space-y-3">
                {qs.map((q, i) => (
                  <QuestionCard
                    key={q.key}
                    q={q}
                    index={i}
                    total={qs.length}
                    open={open === q.key}
                    showErrors={showErrors}
                    onToggle={() => setOpen((o) => (o === q.key ? null : q.key))}
                    onPatch={(p) => patchQ(q.key, p)}
                    onMove={(d) => move(i, d)}
                    onDuplicate={() => duplicate(i)}
                    onRemove={() => setRemoving(q)}
                  />
                ))}
              </ol>
            ) : (
              <EmptyState
                title="No questions yet"
                description={meta.event ? `Write your own, or pull some from the ${eventName(meta.event)} official bank and tweak them.` : 'Write your own questions. Pick an event in the settings to import from the official bank.'}
                action={
                  <>
                    <Button leftIcon={<Plus className="size-4" />} onClick={addBlank}>
                      Write a question
                    </Button>
                    {meta.event && (
                      <Button variant="outline" onClick={() => setImporting(true)}>
                        Import from bank
                      </Button>
                    )}
                  </>
                }
              />
            )}
            <div ref={listEnd} />
            {qs.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={addBlank}
                  className="flex h-14 items-center justify-center gap-2 rounded-none border-2 border-dashed border-line-strong font-display text-sm font-semibold text-muted transition-colors hover:border-blue hover:bg-surface-2 hover:text-blue"
                >
                  <Plus className="size-4" /> Add a question
                </button>
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  disabled={!meta.event}
                  className="flex h-14 items-center justify-center gap-2 rounded-none border-2 border-dashed border-line-strong font-display text-sm font-semibold text-muted transition-colors hover:border-blue hover:bg-surface-2 hover:text-blue disabled:pointer-events-none disabled:opacity-50"
                >
                  Import from the official bank
                </button>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ settings */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2 lg:self-start">
            <Card>
              <h2 className="mb-4 text-base font-bold">Settings</h2>
              <div className="space-y-4">
                <Input label="Name" value={meta.title} maxLength={120} onChange={(e) => patchMeta({ title: e.target.value })} error={!meta.title.trim() ? 'Required' : undefined} />
                <Textarea label="Description" rows={3} maxLength={2000} value={meta.description} onChange={(e) => patchMeta({ description: e.target.value })} placeholder="Shown to members before they start." />
                <Select
                  label="Event"
                  value={meta.event}
                  onChange={(e) => patchMeta({ event: e.target.value })}
                  options={eventOptions(ctx, { allowNone: admin ? 'No event (mixed)' : undefined, manageableOnly: !admin })}
                  hint={admin ? 'Trainers of this event can edit and assign it.' : undefined}
                />
                <div className="space-y-3 rounded-none border border-line bg-surface-2/50 p-3">
                  <Switch checked={meta.timed} onChange={(v) => patchMeta({ timed: v })} label="Time limit" description="The run submits itself when time runs out." />
                  {meta.timed && (
                    <Input
                      aria-label="Minutes"
                      type="number"
                      min={1}
                      max={240}
                      inputMode="numeric"
                      value={meta.minutes}
                      onChange={(e) => patchMeta({ minutes: e.target.value })}
                      right={<span className="pr-2 text-sm text-muted">min</span>}
                      error={timeError}
                      hint={qs.length ? `About ${Math.round(((minutes || 0) * 60) / Math.max(1, qs.length))} s per question (competition pace is 30 s).` : undefined}
                    />
                  )}
                  <Switch checked={meta.shuffle} onChange={(v) => patchMeta({ shuffle: v })} label="Shuffle for each member" description="Questions appear in a different order every run." />
                </div>
              </div>
            </Card>

            <Card>
              <div className={cn('flex items-center gap-3 border-l-4 pl-3', test.published ? 'border-success' : 'border-warning')}>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-heading">{test.published ? 'Published' : 'Draft'}</p>
                  <p className="text-sm text-muted">{test.published ? 'Members can take it from the library.' : 'Only chapter leaders can see it.'}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {test.published ? (
                  <Button variant="outline" loading={saving} onClick={() => void save({ publish: false })}>
                    Move back to drafts
                  </Button>
                ) : (
                  <Button variant="primary" loading={saving} disabled={!qs.length} onClick={() => void save({ publish: true })} leftIcon={<Check className="size-4" />}>
                    {dirty ? 'Save and publish' : 'Publish'}
                  </Button>
                )}
                <Button
                  variant="accent"
                  disabled={!qs.length || saving}
                  onClick={async () => {
                    if (dirty || !test.published) {
                      const s = await save({ publish: true });
                      if (!s) return;
                    }
                    setAssigning(true);
                  }}
                >
                  Assign to chapter
                </Button>
              </div>
            </Card>

            <Stats qs={qs} />
          </aside>
        </div>
      </Page>

      {/* sticky save bar on phones */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 border-t border-line bg-surface px-4 py-2.5 shadow-pop md:hidden">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm font-semibold text-ink">Unsaved changes</span>
            <Button size="sm" variant="accent" loading={saving} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      )}

      <ImportModal
        open={importing}
        event={meta.event}
        imported={imported}
        room={MAX_TEST_QUESTIONS - qs.length}
        onClose={() => setImporting(false)}
        onImport={(picked) => {
          setQs((xs) => [...xs, ...picked.map(fromOfficial)]);
          touch();
          toast.success(`Imported ${pluralize(picked.length, 'question')}`, 'They are copies: edit them freely.');
          setImporting(false);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            setQs((xs) => xs.filter((x) => x.key !== removing.key));
            touch();
          }
        }}
        variant="danger"
        confirmLabel="Remove"
        title="Remove this question?"
        description={removing?.q.trim() ? `"${removing.q.trim().slice(0, 120)}"` : 'This empty question will be removed.'}
      />
      <AssignModal
        open={assigning}
        onClose={() => setAssigning(false)}
        ctx={ctx}
        tests={[test]}
        decks={[]}
        preset={{ kind: 'test', ref: test.id }}
        onSaved={() => navigate('/chapter/classroom?tab=assignments')}
      />
    </>
  );
}

// ------------------------------------------------------------------------------------------------ question card

function QuestionCard({
  q,
  index,
  total,
  open,
  showErrors,
  onToggle,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: {
  q: EQ;
  index: number;
  total: number;
  open: boolean;
  showErrors: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<EQ>) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const issues = problems(q);
  const bad = showErrors && issues.length > 0;
  const firstInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open && !q.q) firstInput.current?.focus();
    // focus only when a fresh question opens
  }, [open, q.q]);

  return (
    <li id={`q-${q.key}`}>
      <Card padded={false} className={cn('overflow-hidden transition-[border-color,box-shadow]', open && 'border-blue', bad && 'border-red/60')}>
        <div className="flex items-start gap-3 p-3 sm:p-4">
          <span
            className={cn(
              'tabular grid size-8 shrink-0 place-items-center rounded-none font-display text-sm font-bold',
              bad ? 'bg-red/10 text-red dark:text-danger' : 'bg-navy/8 text-navy dark:bg-blue/20 dark:text-link',
            )}
          >
            {index + 1}
          </span>
          <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 pt-1 text-left">
            <span className={cn('block text-[0.9375rem] font-semibold leading-snug', q.q.trim() ? 'text-heading' : 'italic text-muted')}>
              {q.q.trim() ? (open ? 'Editing' : q.q) : 'New question'}
            </span>
            {!open && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {q.answer != null && q.choices[q.answer]?.trim() && (
                  <span className="inline-flex max-w-full items-center gap-1 truncate">
                    <Check className="size-3 shrink-0 text-success" />
                    <span className="truncate">{q.choices[q.answer]}</span>
                  </span>
                )}
                {q.sub && <span className="rounded-none bg-surface-2 px-1.5 py-0.5">{q.sub}</span>}
                {q.src && <Badge tone="blue" className="h-5 text-[10px]">From bank</Badge>}
                {bad && <span className="font-semibold text-red dark:text-danger">Missing {issues.join(', ')}</span>}
              </span>
            )}
          </button>
          <div className="flex shrink-0 items-center">
            <IconBtn label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowUp />
            </IconBtn>
            <IconBtn label="Move down" onClick={() => onMove(1)} disabled={index === total - 1}>
              <ArrowDown />
            </IconBtn>
            <IconBtn label={open ? 'Collapse' : 'Expand'} onClick={onToggle}>
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
            </IconBtn>
          </div>
        </div>

        {open && (
          <div className="animate-rise space-y-4 border-t border-line bg-surface-2/30 p-4 sm:p-5">
            <Textarea
              ref={firstInput}
              label="Question"
              rows={3}
              maxLength={2000}
              value={q.q}
              onChange={(e) => onPatch({ q: e.target.value })}
              error={showErrors && !q.q.trim() ? 'Write the question.' : undefined}
              placeholder="e.g. Which financial statement reports a company's assets, liabilities and equity at a point in time?"
            />
            <fieldset>
              <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-semibold text-ink">
                Choices
                <span className="text-xs font-normal text-muted">Tick the correct one</span>
              </legend>
              <div className="space-y-2">
                {q.choices.map((c, ci) => {
                  const correct = q.answer === ci;
                  return (
                    <div key={ci} className={cn('flex items-center gap-2 rounded-none border p-1.5 pr-2 transition-colors', correct ? 'border-success/50 bg-success/[0.07]' : 'border-line-strong bg-surface')}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={correct}
                        aria-label={`Mark ${LETTERS[ci]} as correct`}
                        onClick={() => onPatch({ answer: ci })}
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-none font-display text-sm font-bold transition-colors',
                          correct ? 'bg-success text-white' : 'bg-surface-2 text-muted hover:bg-success/15 hover:text-success',
                        )}
                      >
                        {correct ? <Check className="size-4" /> : LETTERS[ci]}
                      </button>
                      <input
                        aria-label={`Choice ${LETTERS[ci]}`}
                        value={c}
                        maxLength={500}
                        onChange={(e) => {
                          const n = [...q.choices] as EQ['choices'];
                          n[ci] = e.target.value;
                          onPatch({ choices: n });
                        }}
                        placeholder={`Choice ${LETTERS[ci]}`}
                        className={cn('h-9 min-w-0 flex-1 bg-transparent px-1 text-[0.9375rem] text-ink outline-none placeholder:text-muted/60', showErrors && !c.trim() && 'placeholder:text-red/70')}
                      />
                    </div>
                  );
                })}
              </div>
              {showErrors && q.answer == null && <p className="mt-1.5 text-[0.8125rem] font-medium text-danger">Mark the correct answer.</p>}
            </fieldset>
            <Textarea
              label="Explanation"
              rows={2}
              maxLength={2000}
              value={q.explain}
              onChange={(e) => onPatch({ explain: e.target.value })}
              hint="Shown after the member answers. Say why the right answer is right."
            />
            <Input label="Topic area (optional)" value={q.sub} maxLength={120} onChange={(e) => onPatch({ sub: e.target.value })} placeholder="e.g. Financial statements" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" leftIcon={<Copy className="size-4" />} onClick={onDuplicate}>
                  Duplicate
                </Button>
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10" leftIcon={<Trash2 className="size-4" />} onClick={onRemove}>
                  Remove
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={onToggle}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-none text-muted transition-colors hover:bg-surface-2 hover:text-heading disabled:pointer-events-none disabled:opacity-30 [&>svg]:size-4"
    >
      {children}
    </button>
  );
}

function Stats({ qs }: { qs: EQ[] }) {
  if (!qs.length) return null;
  const answers = [0, 0, 0, 0];
  for (const q of qs) if (q.answer != null) answers[q.answer]++;
  const max = Math.max(1, ...answers);
  const fromBank = qs.filter((q) => q.src).length;
  const withExplain = qs.filter((q) => q.explain.trim()).length;
  return (
    <Card>
      <h2 className="mb-3 text-base font-bold">At a glance</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">From bank</dt>
          <dd className="tabular font-display text-lg font-bold text-heading">{fromBank}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Explained</dt>
          <dd className="tabular font-display text-lg font-bold text-heading">
            {withExplain}/{qs.length}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Correct answer spread</p>
      <div className="mt-2 flex h-16 items-end gap-2" aria-label="How often each letter is the correct answer">
        {answers.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-none bg-blue/70 transition-[height] duration-300 dark:bg-link/70" style={{ height: `${Math.max(4, (n / max) * 44)}px` }} />
            <span className="tabular text-xs text-muted">
              {LETTERS[i]} <span className="font-semibold text-ink">{n}</span>
            </span>
          </div>
        ))}
      </div>
      {qs.length >= 8 && Math.max(...answers) / qs.length > 0.45 && (
        <p className="mt-3 text-xs text-[#8a5f00] dark:text-warning">Most answers are the same letter. Members may spot the pattern.</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ import

function ImportModal({
  open,
  event,
  imported,
  room,
  onClose,
  onImport,
}: {
  open: boolean;
  event: string;
  imported: Set<string>;
  room: number;
  onClose: () => void;
  onImport: (qs: Question[]) => void;
}) {
  const [bank, setBank] = useState<Question[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sub, setSub] = useState('');
  const [diff, setDiff] = useState<number | 0>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [peek, setPeek] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !event) return;
    let live = true;
    setBank(null);
    setErr(null);
    setPicked([]);
    setQ('');
    setSub('');
    setDiff(0);
    // the public bank has no keys; staff get them from the server (fbla_question_bank)
    Promise.all([loadQuestions(event), getBankKeys(event)])
      .then(([b, keys]) => live && setBank(applyKeys(b, keys)))
      .catch((e) => live && setErr(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [open, event]);

  const subs = useMemo(() => [...new Set((bank ?? []).map((x) => x.sub))].sort(), [bank]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (bank ?? []).filter(
      (x) =>
        (!sub || x.sub === sub) &&
        (!diff || x.diff === diff) &&
        (!s || x.q.toLowerCase().includes(s) || x.choices.some((c) => c.toLowerCase().includes(s)) || x.id.toLowerCase().includes(s)),
    );
  }, [bank, q, sub, diff]);
  const available = shown.filter((x) => !imported.has(x.id));
  const pickedSet = new Set(picked);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const over = picked.length > room;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Import from the ${eventName(event)} bank`}
      description="Imported questions are copies; the official bank is not changed. Because this shows the answer key, these questions no longer count toward your own Elo."
      footer={
        <>
          <span className={cn('mr-auto self-center text-sm', over ? 'font-semibold text-danger' : 'text-muted')}>
            {over ? `Only ${room} more fit in this test` : `${picked.length} selected`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked.length || over} onClick={() => bank && onImport(picked.map((id) => bank.find((x) => x.id === id)!).filter(Boolean))}>
            Import {picked.length || ''}
          </Button>
        </>
      }
    >
      {err ? (
        <ErrorState error={err} />
      ) : !bank ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div>
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <Input aria-label="Search questions" leftIcon={<Search />} placeholder={`Search ${bank.length} questions`} value={q} onChange={(e) => setQ(e.target.value)} />
            <Select aria-label="Topic area" value={sub} onChange={(e) => setSub(e.target.value)} options={[{ value: '', label: 'All areas' }, ...subs.map((s) => ({ value: s, label: s }))]} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[0, 1, 2, 3].map((d) => (
              <Pill key={d} className="h-7 px-3 text-xs" active={diff === d} onClick={() => setDiff(d)}>
                {d ? DIFFICULTY_LABELS[d as 1 | 2 | 3] : 'Any difficulty'}
              </Pill>
            ))}
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <Button
              size="xs"
              variant="secondary"
              leftIcon={<Shuffle className="size-3.5" />}
              disabled={!available.length}
              onClick={() => {
                const pool = available.filter((x) => !pickedSet.has(x.id));
                const n = Math.min(10, pool.length, Math.max(0, room - picked.length));
                setPicked((p) => [...p, ...shuffled(pool).slice(0, n).map((x) => x.id)]);
              }}
            >
              Pick 10 at random
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!available.length}
              onClick={() => {
                const all = available.every((x) => pickedSet.has(x.id));
                setPicked((p) => (all ? p.filter((id) => !available.some((x) => x.id === id)) : [...new Set([...p, ...available.map((x) => x.id)])]));
              }}
            >
              {available.length && available.every((x) => pickedSet.has(x.id)) ? 'Clear shown' : `Select all ${available.length} shown`}
            </Button>
            {picked.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setPicked([])}>
                Clear selection
              </Button>
            )}
          </div>

          <ul className="mt-3 max-h-[52dvh] divide-y divide-line overflow-y-auto rounded-none border border-line">
            {shown.map((x) => {
              const done = imported.has(x.id);
              const on = pickedSet.has(x.id);
              const expanded = peek === x.id;
              return (
                <li key={x.id} className={cn('px-3 py-3 transition-colors', on && 'bg-blue/[0.06]', done && 'opacity-55')}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={on || done} disabled={done} onChange={() => toggle(x.id)} label={<span className="sr-only">Select {x.id}</span>} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <button type="button" className="block w-full text-left" onClick={() => setPeek(expanded ? null : x.id)} aria-expanded={expanded}>
                        <span className={cn('block text-sm leading-snug text-ink', !expanded && 'line-clamp-2')}>{x.q}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span className="font-mono">{x.id}</span>·<span>{x.sub}</span>·<span>{DIFFICULTY_LABELS[x.diff]}</span>
                          {done && <Badge tone="success" className="h-5 text-[10px]">In test</Badge>}
                        </span>
                      </button>
                      {expanded && (
                        <ol className="mt-2 space-y-1 text-sm">
                          {x.choices.map((c, ci) => (
                            <li key={ci} className={cn('flex gap-2 rounded-none px-2 py-1', ci === x.answer ? 'bg-success/10 font-semibold text-success' : 'text-ink/80')}>
                              <span className="w-4 shrink-0 font-display font-bold">{LETTERS[ci]}</span>
                              {c}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {!shown.length && <li className="px-4 py-10 text-center text-sm text-muted">No questions match these filters.</li>}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Tap
 a question to preview its choices and answer.
          </p>
        </div>
      )}
    </Modal>
  );
}
