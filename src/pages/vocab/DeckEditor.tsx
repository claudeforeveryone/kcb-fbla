import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Input, Modal, Select, Textarea, cn, errorMessage, useToast } from '../../components/ui';
import { EVENTS, type Deck, type DeckCard } from '../../lib/types';
import { cleanCards, createDeck, deleteDeck, parseCardText, updateDeck, type DeckStaffScope } from '../../api/vocab';
import { removeChapterDeck, upsertChapterDeck } from './store';

type Row = DeckCard & { k: number };
let seq = 0;
const row = (c?: DeckCard): Row => ({ term: c?.term ?? '', def: c?.def ?? '', k: ++seq });

/** Create or edit a chapter flashcard deck (chapter staff only; the database enforces it too). */
export function DeckEditor({
  open,
  onClose,
  chapterId,
  scope,
  deck,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  scope: DeckStaffScope;
  /** Editing an existing deck when set. */
  deck?: Deck | null;
  onSaved?: (deck: Deck) => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [event, setEvent] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lastTerm = useRef<HTMLInputElement | null>(null);
  const [focusNew, setFocusNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(deck?.title ?? '');
    setEvent(deck?.event ?? (scope.admin ? '' : (scope.events[0] ?? '')));
    setRows(deck?.cards?.length ? deck.cards.map(row) : [row(), row(), row()]);
    setPaste(null);
    setErr(null);
  }, [open, deck, scope]);

  useEffect(() => {
    if (focusNew) {
      lastTerm.current?.focus();
      setFocusNew(false);
    }
  }, [focusNew, rows]);

  const eventOptions = [
    ...(scope.admin || scope.events.length ? [{ value: '', label: 'Any event (general)' }] : []),
    ...EVENTS.filter((e) => scope.admin || scope.events.includes(e.slug)).map((e) => ({ value: e.slug, label: e.name })),
  ];
  const valid = cleanCards(rows).length;

  const setCell = (k: number, field: 'term' | 'def', v: string) =>
    setRows((rs) => rs.map((r) => (r.k === k ? { ...r, [field]: v } : r)));

  const importPaste = () => {
    const cards = parseCardText(paste ?? '');
    if (!cards.length) {
      setErr('Put one card per line, like "Asset - Something of value a business owns".');
      return;
    }
    setRows((rs) => [...rs.filter((r) => r.term.trim() || r.def.trim()), ...cards.map(row)]);
    setPaste(null);
    setErr(null);
    toast.success(`Added ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`);
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const input = { title, event: event || null, cards: rows };
      const saved = deck ? await updateDeck(deck.id, input) : await createDeck(chapterId, input);
      upsertChapterDeck(saved);
      toast.success(deck ? 'Deck saved' : 'Deck created', `${saved.cards.length} cards ready for your chapter.`);
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={busy ? () => {} : onClose}
        size="xl"
        title={deck ? 'Edit deck' : 'New chapter deck'}
        description="Everyone in your chapter can study it with flashcards, learn, match and quiz."
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {deck && (
              <Button variant="danger" leftIcon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete
              </Button>
            )}
            <span className="ml-auto" aria-hidden />
            <span className="tabular hidden text-sm text-muted sm:inline">
              {valid} {valid === 1 ? 'card' : 'cards'}
            </span>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              {deck ? 'Save deck' : 'Create deck'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
            <Input label="Title" placeholder="e.g. Week 3: Financial statements" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <Select label="Event" value={event} onChange={(e) => setEvent(e.target.value)} options={eventOptions} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Cards</h3>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ClipboardPaste className="size-4" />}
              onClick={() => setPaste((p) => (p === null ? '' : null))}
            >
              {paste === null ? 'Paste a list' : 'Close paste'}
            </Button>
          </div>

          {paste !== null && (
            <div className="animate-rise grid gap-2 rounded-[12px] border border-line bg-surface-2/60 p-3">
              <Textarea
                label="One card per line"
                hint='Separate the term and definition with a tab, " - " or ": ". Spreadsheet columns paste as tabs.'
                rows={6}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'Asset - Something of value a business owns\nLiability: A debt the business owes'}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={importPaste} disabled={!paste.trim()}>
                  Add {parseCardText(paste).length || ''} cards
                </Button>
              </div>
            </div>
          )}

          <ol className="grid gap-2">
            {rows.map((r, i) => (
              <li key={r.k} className="flex items-start gap-2 rounded-[8px] border border-line bg-surface p-2.5">
                <span className="tabular mt-2.5 w-6 shrink-0 text-center text-xs font-bold text-muted">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
                  <Input
                    ref={i === rows.length - 1 ? lastTerm : undefined}
                    aria-label={`Card ${i + 1} term`}
                    placeholder="Term"
                    value={r.term}
                    maxLength={200}
                    onChange={(e) => setCell(r.k, 'term', e.target.value)}
                    inputClassName="font-semibold"
                  />
                  <Textarea
                    aria-label={`Card ${i + 1} definition`}
                    placeholder="Definition"
                    rows={2}
                    value={r.def}
                    maxLength={1000}
                    onChange={(e) => setCell(r.k, 'def', e.target.value)}
                    className="[&_textarea]:min-h-16 [&_textarea]:py-2"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove card ${i + 1}`}
                  className={cn('mt-1 shrink-0 text-muted hover:text-danger', rows.length <= 1 && 'invisible')}
                  onClick={() => setRows((rs) => rs.filter((x) => x.k !== r.k))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button
            variant="outline"
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              setRows((rs) => [...rs, row()]);
              setFocusNew(true);
            }}
          >
            Add card
          </Button>
          {err && (
            <p role="alert" className="rounded-[8px] bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {err}
            </p>
          )}
        </div>
      </Modal>
      {deck && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete this deck?"
          description={`"${deck.title}" will be removed for everyone in your chapter. Members' progress on it is kept but the cards are gone.`}
          confirmLabel="Delete deck"
          variant="danger"
          onConfirm={async () => {
            try {
              await deleteDeck(deck.id);
              removeChapterDeck(deck.id);
              toast.success('Deck deleted');
              onClose();
              onDeleted?.();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      )}
    </>
  );
}
