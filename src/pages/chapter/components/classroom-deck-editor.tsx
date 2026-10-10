import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button, Checkbox, Input, Modal, Select, Spinner, Textarea, cn, errorMessage, useToast } from '../../../components/ui';
import { loadVocab } from '../../../lib/content';
import type { Term } from '../../../lib/srs';
import type { DeckCard } from '../../../lib/types';
import { createDeck, isAdmin, parseCardText, updateDeck, type ClassDeck, type ClassroomContext } from '../../../api/classroom';
import { eventOptions, pluralize } from './classroom-shared';

type Row = DeckCard & { key: number };
let seq = 0;
const row = (c: DeckCard = { term: '', def: '' }): Row => ({ ...c, key: ++seq });

export function DeckEditor({
  open,
  onClose,
  ctx,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ctx: ClassroomContext;
  editing?: ClassDeck | null;
  onSaved: (d: ClassDeck, created: boolean) => void;
}) {
  const toast = useToast();
  const admin = isAdmin(ctx);
  const [title, setTitle] = useState('');
  const [event, setEvent] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<'cards' | 'paste' | 'vocab'>('cards');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMode('cards');
    setPaste('');
    if (editing) {
      setTitle(editing.title);
      setEvent(editing.event ?? '');
      setRows(editing.cards.map((c) => row(c)));
    } else {
      setTitle('');
      setEvent(admin ? '' : (ctx.trainerEvents[0] ?? ''));
      setRows([row(), row(), row()]);
    }
  }, [open, editing, admin, ctx.trainerEvents]);

  const filled = rows.filter((r) => r.term.trim() && r.def.trim());
  const parsed = useMemo(() => parseCardText(paste), [paste]);

  const addCards = (cards: DeckCard[]) => {
    setRows((rs) => [...rs.filter((r) => r.term.trim() || r.def.trim()), ...cards.map((c) => row(c))]);
    setMode('cards');
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Name the deck.';
    if (!admin && !event) e.event = 'Pick one of the events you train.';
    if (!filled.length) e.cards = 'Add at least one card with a term and a definition.';
    const half = rows.filter((r) => !!r.term.trim() !== !!r.def.trim());
    if (half.length) e.cards = `${pluralize(half.length, 'card')} ${half.length === 1 ? 'is' : 'are'} missing a term or definition.`;
    if (filled.length > 500) e.cards = 'A deck can have at most 500 cards.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const input = { title, event: event || null, cards: filled };
      const saved = editing ? await updateDeck(editing.id, input) : await createDeck(ctx.chapter.id, input);
      toast.success(editing ? 'Deck saved' : 'Deck created', pluralize(saved.cards.length, 'card'));
      onSaved(saved, !editing);
      onClose();
    } catch (err) {
      toast.error('Could not save the deck', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="xl"
      title={editing ? 'Edit deck' : 'New flashcard deck'}
      description="Members flip through these in the classroom, and you can assign the deck."
      footer={
        <>
          <span className="mr-auto hidden self-center text-sm text-muted sm:block">{pluralize(filled.length, 'card')}</span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save deck' : 'Create deck'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <Input label="Deck name" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="e.g. Accounting: adjusting entries" data-autofocus />
        <Select
          label="Event"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          error={errors.event}
          options={eventOptions(ctx, { allowNone: admin ? 'No event' : undefined, manageableOnly: !admin })}
          placeholder={admin ? undefined : 'Choose an event'}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" variant={mode === 'cards' ? 'secondary' : 'ghost'} onClick={() => setMode('cards')}>
          Cards
        </Button>
        <Button size="sm" variant={mode === 'paste' ? 'secondary' : 'ghost'} onClick={() => setMode('paste')}>
          Paste a list
        </Button>
        <Button
          size="sm"
          variant={mode === 'vocab' ? 'secondary' : 'ghost'}
          onClick={() => setMode('vocab')}
          disabled={!event}
          title={event ? undefined : 'Pick an event first'}
        >
          From official vocab
        </Button>
      </div>
      {errors.cards && (
        <p className="mt-3 text-[0.8125rem] font-medium text-danger" role="alert">
          {errors.cards}
        </p>
      )}

      {mode === 'cards' && (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="group grid grid-cols-[1.75rem_1fr_auto] items-start gap-2 rounded-[4px] border border-line bg-surface-2/40 p-2 sm:grid-cols-[1.75rem_minmax(0,2fr)_minmax(0,3fr)_auto]">
              <span className="tabular pt-2.5 text-center text-xs font-bold text-muted">{i + 1}</span>
              <input
                aria-label={`Card ${i + 1} term`}
                value={r.term}
                maxLength={300}
                placeholder="Term"
                onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, term: e.target.value } : x)))}
                className="h-10 w-full rounded-[2px] border border-line-strong bg-surface px-3 text-[0.9375rem] font-semibold text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15"
              />
              <button
                type="button"
                aria-label={`Remove card ${i + 1}`}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="grid size-10 place-items-center rounded-[2px] text-muted transition-colors hover:bg-danger/10 hover:text-danger sm:order-last"
              >
                <Trash2 className="size-4" />
              </button>
              <textarea
                aria-label={`Card ${i + 1} definition`}
                value={r.def}
                maxLength={1500}
                rows={1}
                placeholder="Definition"
                onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, def: e.target.value } : x)))}
                className="col-span-2 col-start-2 min-h-10 w-full resize-y rounded-[2px] border border-line-strong bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15 sm:col-span-1 sm:col-start-auto"
              />
            </div>
          ))}
          <Button variant="outline" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setRows((rs) => [...rs, row()])} disabled={rows.length >= 500}>
            Add card
          </Button>
        </div>
      )}

      {mode === 'paste' && (
        <div className="mt-3">
          <Textarea
            label="One card per line"
            hint="Separate the term and definition with a tab, a dash ( - ), or a colon. Copying two columns from a spreadsheet works too."
            rows={8}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Asset - Something the business owns that has value\nLiability - An amount the business owes'}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted">{parsed.length ? `${pluralize(parsed.length, 'card')} found` : 'No cards found yet'}</span>
            <Button size="sm" onClick={() => addCards(parsed)} disabled={!parsed.length}>
              Add {parsed.length || ''} to deck
            </Button>
          </div>
        </div>
      )}

      {mode === 'vocab' && event && (
        <VocabPicker event={event} existing={new Set(rows.map((r) => r.term.trim().toLowerCase()))} onAdd={addCards} />
      )}
    </Modal>
  );
}

function VocabPicker({ event, existing, onAdd }: { event: string; existing: Set<string>; onAdd: (c: DeckCard[]) => void }) {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setTerms(null);
    setPicked(new Set());
    loadVocab()
      .then((all) => live && setTerms(all.filter((t) => t.topic === event)))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [event]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (terms ?? []).filter((t) => !s || t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s) || t.sub?.toLowerCase().includes(s));
  }, [terms, q]);

  if (error) return <p className="mt-3 text-sm text-danger">{error}</p>;
  if (!terms)
    return (
      <div className="mt-6 flex justify-center">
        <Spinner className="size-5" />
      </div>
    );
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownPicked = shown.length > 0 && shown.every((t) => picked.has(t.id));

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input className="flex-1" aria-label="Search vocab" leftIcon={<Search />} placeholder={`Search ${terms.length} terms`} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setPicked((p) => {
              const n = new Set(p);
              for (const t of shown) {
                if (allShownPicked) n.delete(t.id);
                else n.add(t.id);
              }
              return n;
            })
          }
        >
          {allShownPicked ? 'Clear' : 'Select'} all shown
        </Button>
      </div>
      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-[4px] border border-line">
        {shown.map((t) => {
          const dup = existing.has(t.term.trim().toLowerCase());
          return (
            <li key={t.id} className={cn('flex items-start gap-3 px-3 py-2.5', dup && 'opacity-50')}>
              <Checkbox checked={picked.has(t.id)} onChange={() => toggle(t.id)} disabled={dup} label={<span className="sr-only">Add {t.term}</span>} className="mt-0.5" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !dup && toggle(t.id)} disabled={dup}>
                <span className="block text-sm font-semibold text-heading">
                  {t.term} {dup && <span className="text-xs font-normal text-muted">(already in deck)</span>}
                </span>
                <span className="block text-[0.8125rem] text-muted">{t.def}</span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-6 text-center text-sm text-muted">No terms match.</li>}
      </ul>
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={!picked.size} onClick={() => onAdd((terms ?? []).filter((t) => picked.has(t.id)).map((t) => ({ term: t.term, def: t.def })))}>
          Add {picked.size || ''} to deck
        </Button>
      </div>
    </div>
  );
}
