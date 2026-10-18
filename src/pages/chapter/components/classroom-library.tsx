import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, Search } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Dropdown,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
  errorMessage,
  useToast,
  type DropdownItem,
} from '../../../components/ui';
import {
  canManage,
  createCustomTest,
  customTestHref,
  duplicateCustomTest,
  isAdmin,
  isStaff,
  type ClassDeck,
  type ClassTest,
  type ClassroomContext,
} from '../../../api/classroom';
import type { AssignPreset } from './classroom-assign-modal';
import { EventTag, KindLabel, SectionLabel, eventOptions, pluralize, timeAgo } from './classroom-shared';

export function LibraryPanel({
  ctx,
  tests,
  decks,
  event,
  onAssign,
  onNewDeck,
  onEditDeck,
  onStudyDeck,
  onDeleteTest,
  onDeleteDeck,
  onTestCreated,
}: {
  ctx: ClassroomContext;
  tests: ClassTest[];
  decks: ClassDeck[];
  event: string;
  onAssign: (p: AssignPreset) => void;
  onNewDeck: () => void;
  onEditDeck: (d: ClassDeck) => void;
  onStudyDeck: (d: ClassDeck) => void;
  onDeleteTest: (t: ClassTest) => void;
  onDeleteDeck: (d: ClassDeck) => void;
  onTestCreated: (t: ClassTest) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const staff = isStaff(ctx);
  const [q, setQ] = useState('');
  const [newTest, setNewTest] = useState(false);

  const match = (title: string, ev: string | null) =>
    (!event || ev === event) && (!q.trim() || title.toLowerCase().includes(q.trim().toLowerCase()));
  const shownTests = tests.filter((t) => match(t.title, t.event) && (t.published || canManage(ctx, t.event)));
  const shownDecks = decks.filter((d) => match(d.title, d.event));

  const duplicate = async (t: ClassTest) => {
    try {
      const copy = await duplicateCustomTest(t);
      onTestCreated(copy);
      toast.success('Test copied', 'The copy is a draft.');
      navigate(`/chapter/tests/${copy.id}/edit`);
    } catch (e) {
      toast.error('Could not copy the test', errorMessage(e));
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input className="sm:max-w-xs sm:flex-1" aria-label="Search the library" leftIcon={<Search />} placeholder="Search tests and decks" value={q} onChange={(e) => setQ(e.target.value)} />
        {staff && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="primary" leftIcon={<Plus className="size-4" />} onClick={() => setNewTest(true)}>
              New test
            </Button>
            <Button variant="outline" leftIcon={<Plus className="size-4" />} onClick={onNewDeck}>
              New deck
            </Button>
          </div>
        )}
      </div>

      <SectionLabel>Chapter tests</SectionLabel>
      {shownTests.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shownTests.map((t) => {
            const manage = canManage(ctx, t.event);
            const items: DropdownItem[] = manage
              ? [
                  { label: 'Edit questions', to: `/chapter/tests/${t.id}/edit` },
                  ...(t.questions.length ? [{ label: 'Assign', onSelect: () => onAssign({ kind: 'test', ref: t.id }) }] : []),
                  { label: 'Duplicate', onSelect: () => void duplicate(t) },
                  { type: 'separator' },
                  { label: 'Delete', danger: true, onSelect: () => onDeleteTest(t) },
                ]
              : [];
            return (
              <Card key={t.id} padded={false} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <KindLabel label="Test" accent="bg-blue text-white" className="mb-1.5" />
                    <h3 className="line-clamp-2 text-base font-bold leading-snug">{t.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <EventTag event={t.event} />
                      {!t.published && <Badge tone="warning">Draft</Badge>}
                      {t.source === 'copied' && <Badge tone="neutral">From official bank</Badge>}
                    </div>
                  </div>
                  {items.length > 0 && (
                    <Dropdown
                      width="w-48"
                      items={items}
                      trigger={({ open: _o, ...p }) => (
                        <Button {...p} variant="ghost" size="icon-sm" aria-label={`Actions for ${t.title}`} className="-mr-1.5 -mt-1 text-muted">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      )}
                    />
                  )}
                </div>
                {t.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{t.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                    <span className="tabular font-semibold text-ink">{pluralize(t.questions.length, 'question')}</span>
                    {t.time_limit_sec ? (
                      <span>
                        {Math.round(t.time_limit_sec / 60)} min
                      </span>
                    ) : null}
                    <span>{timeAgo(t.updated_at)}</span>
                  </div>
                  {t.published && t.questions.length > 0 ? (
                    <ButtonLink to={customTestHref(t.id)} size="sm" variant="secondary">
                      Take
                    </ButtonLink>
                  ) : manage ? (
                    <ButtonLink to={`/chapter/tests/${t.id}/edit`} size="sm" variant="secondary" leftIcon={<Pencil className="size-3.5" />}>
                      Edit
                    </ButtonLink>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          compact
          title={tests.length ? 'No tests match' : 'No chapter tests yet'}
          description={
            staff
              ? 'Write your own questions or pull them from the official bank, then assign the test to the chapter.'
              : 'When your trainers publish a practice test, it appears here.'
          }
          action={staff && !tests.length ? <Button onClick={() => setNewTest(true)} leftIcon={<Plus className="size-4" />}>Build a test</Button> : undefined}
        />
      )}

      <div className="mt-10">
        <SectionLabel>Flashcard decks</SectionLabel>
        {shownDecks.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shownDecks.map((d) => {
              const manage = canManage(ctx, d.event);
              const items: DropdownItem[] = manage
                ? [
                    { label: 'Edit cards', onSelect: () => onEditDeck(d) },
                    ...(d.cards.length ? [{ label: 'Assign', onSelect: () => onAssign({ kind: 'deck', ref: d.id }) }] : []),
                    { type: 'separator' },
                    { label: 'Delete', danger: true, onSelect: () => onDeleteDeck(d) },
                  ]
                : [];
              return (
                <Card key={d.id} padded={false} className="group relative flex flex-col overflow-hidden p-4">
                  <div className="relative flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <KindLabel label="Deck" accent="bg-success text-white" className="mb-1.5" />
                      <h3 className="line-clamp-2 text-base font-bold leading-snug">{d.title}</h3>
                      <div className="mt-1">
                        <EventTag event={d.event} />
                      </div>
                    </div>
                    {items.length > 0 && (
                      <Dropdown
                        width="w-44"
                        items={items}
                        trigger={({ open: _o, ...p }) => (
                          <Button {...p} variant="ghost" size="icon-sm" aria-label={`Actions for ${d.title}`} className="-mr-1.5 -mt-1 text-muted">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        )}
                      />
                    )}
                  </div>
                  {d.cards[0] && (
                    <p className="relative mt-3 line-clamp-2 rounded-none border-l-2 border-line-strong bg-surface-2 px-3 py-2
 text-[0.8125rem] text-muted">
                      <span className="font-semibold text-ink">{d.cards[0].term}</span> · {d.cards[0].def}
                    </p>
                  )}
                  <div className="relative mt-auto flex items-center justify-between gap-3 pt-4">
                    <span className="tabular text-[0.8125rem] font-semibold text-ink">{pluralize(d.cards.length, 'card')}</span>
                    <Button size="sm" variant="secondary" onClick={() => onStudyDeck(d)} disabled={!d.cards.length}>
                      Study
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            compact
            title={decks.length ? 'No decks match' : 'No flashcard decks yet'}
            description={staff ? 'Make a deck from scratch, paste a list, or pick terms from the official vocab.' : 'Decks your trainers make show up here for you to study.'}
            action={staff && !decks.length ? <Button variant="outline" onClick={onNewDeck} leftIcon={<Plus className="size-4" />}>Make a deck</Button> : undefined}
          />
        )}
      </div>

      <NewTestModal
        open={newTest}
        onClose={() => setNewTest(false)}
        ctx={ctx}
        defaultEvent={event}
        onCreated={(t) => {
          onTestCreated(t);
          navigate(`/chapter/tests/${t.id}/edit`);
        }}
      />
    </div>
  );
}

function NewTestModal({
  open,
  onClose,
  ctx,
  defaultEvent,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ctx: ClassroomContext;
  defaultEvent: string;
  onCreated: (t: ClassTest) => void;
}) {
  const toast = useToast();
  const admin = isAdmin(ctx);
  const initialEvent = defaultEvent && canManage(ctx, defaultEvent) ? defaultEvent : admin ? '' : (ctx.trainerEvents[0] ?? '');
  const [title, setTitle] = useState('');
  const [event, setEvent] = useState(initialEvent);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) setEvent(initialEvent);
  }, [open, initialEvent]);

  const create = async () => {
    if (!title.trim()) return setErr('Give the test a name.');
    if (!admin && !event) return setErr('Pick one of the events you train.');
    setBusy(true);
    try {
      const t = await createCustomTest(ctx.chapter.id, { title, event: event || null, description });
      toast.success('Test created', 'Add questions, then publish or assign it.');
      onCreated(t);
      onClose();
      setTitle('');
      setDescription('');
    } catch (e) {
      toast.error('Could not create the test', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="New chapter test"
      description="You will add questions on the next screen: write your own or import them from the official bank."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} loading={busy}>
            Create and add questions
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Test name"
          value={title}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            setErr(null);
          }}
          error={err && !title.trim() ? err : undefined}
          placeholder="e.g. Week 3: Financial statements"
          data-autofocus
        />
        <Select
          label="Event"
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setErr(null);
          }}
          error={err && title.trim() ? err : undefined}
          options={eventOptions(ctx, { allowNone: admin ? 'No event (mixed topics)' : undefined, manageableOnly: !admin })}
          placeholder={admin ? undefined : 'Choose an event'}
          hint="Pick an event to import its official questions."
        />
        <Textarea label="Description (optional)" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it covers and how to approach it." />
      </div>
    </Modal>
  );
}
