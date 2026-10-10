import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Shuffle, Undo2, X } from 'lucide-react';
import { Button, Kbd, Modal, ProgressBar, ProgressRing, cn, errorMessage, useToast } from '../../../components/ui';
import type { DeckCard } from '../../../lib/types';
import { completeDeckAssignment, type ClassAssignment, type ClassDeck } from '../../../api/classroom';
import { EventTag, pluralize } from './classroom-shared';

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Flashcard study session for a chapter deck. Flip (Space / click), then "Still learning" (1 / Left) or
 * "Got it" (2 / Right). When studying an assigned deck, finishing the first pass records it as done.
 */
export function DeckStudy({
  deck,
  assignment,
  onClose,
  onCompleted,
}: {
  deck: ClassDeck | null;
  assignment?: ClassAssignment | null;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const toast = useToast();
  const [order, setOrder] = useState<DeckCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<boolean[]>([]);
  const [firstPass, setFirstPass] = useState(true);
  const [recorded, setRecorded] = useState(false);
  const [saving, setSaving] = useState(false);
  const started = useRef(Date.now());

  const reset = useCallback((cards: DeckCard[], shuffle: boolean) => {
    setOrder(shuffle ? shuffled(cards) : cards);
    setIdx(0);
    setFlipped(false);
    setKnown([]);
  }, []);

  useEffect(() => {
    if (!deck) return;
    started.current = Date.now();
    setFirstPass(true);
    setRecorded(false);
    reset(deck.cards, false);
  }, [deck, reset]);

  const done = order.length > 0 && idx >= order.length;
  const knownCount = known.filter(Boolean).length;
  const missed = useMemo(() => order.filter((_, i) => known[i] === false), [order, known]);

  const record = useCallback(async () => {
    if (!assignment || recorded || !firstPass || !deck) return;
    setSaving(true);
    try {
      await completeDeckAssignment(assignment.id, knownCount, order.length, Date.now() - started.current);
      setRecorded(true);
      onCompleted?.();
      toast.success('Assignment complete', `${knownCount} of ${order.length} cards known.`);
    } catch (e) {
      toast.error('Could not record your progress', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [assignment, recorded, firstPass, deck, knownCount, order.length, onCompleted, toast]);

  useEffect(() => {
    if (done) void record();
  }, [done, record]);

  const answer = useCallback(
    (k: boolean) => {
      if (done) return;
      setKnown((xs) => {
        const n = [...xs];
        n[idx] = k;
        return n;
      });
      setFlipped(false);
      setIdx((i) => i + 1);
    },
    [idx, done],
  );
  const undo = () => {
    if (idx === 0) return;
    setIdx((i) => i - 1);
    setKnown((xs) => xs.slice(0, idx - 1));
    setFlipped(true);
  };

  useEffect(() => {
    if (!deck || done) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON' && e.key === 'Enter') return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === '1' || e.key === 'ArrowLeft') answer(false);
      else if (e.key === '2' || e.key === 'ArrowRight') answer(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deck, done, answer]);

  if (!deck) return null;
  const card = order[idx];

  return (
    <Modal
      open={!!deck}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {deck.title}
          <EventTag event={deck.event} />
        </span>
      }
      description={assignment ? `Assignment · ${pluralize(deck.cards.length, 'card')}` : pluralize(deck.cards.length, 'card')}
    >
      {!done && card ? (
        <div className="pb-2">
          <div className="mb-4 flex items-center gap-3">
            <ProgressBar value={idx} max={order.length} size="sm" tone="navy" className="flex-1" />
            <span className="tabular text-sm font-semibold text-muted">
              {idx + 1} / {order.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show term' : 'Show definition'}
            className="group block w-full [perspective:1400px]"
          >
            <div
              className={cn(
                'relative h-64 w-full transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none sm:h-72',
                flipped && '[transform:rotateY(180deg)]',
              )}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2px] border-b-4 border-red bg-navy p-6 text-center text-white [backface-visibility:hidden]">
                <span className="absolute left-5 top-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Term</span>
                <span className="font-display text-2xl font-bold leading-tight sm:text-3xl">{card.term}</span>
                <span className="absolute bottom-4 text-xs text-white/60">Tap or press Space to flip</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[2px] border border-line bg-surface p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="absolute left-5 top-4 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Definition</span>
                <span className="text-lg leading-relaxed text-ink sm:text-xl">{card.def}</span>
              </div>
            </div>
          </button>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={() => answer(false)} leftIcon={<X className="size-5 text-red" />}>
              Still learning
            </Button>
            <Button variant="primary" size="lg" onClick={() => answer(true)} leftIcon={<Check className="size-5" />}>
              Got it
            </Button>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <button type="button" onClick={undo} disabled={idx === 0} className="inline-flex items-center gap-1 font-semibold hover:text-ink disabled:opacity-40">
              <Undo2 className="size-3.5" /> Undo
            </button>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>Space</Kbd> flip <Kbd>1</Kbd> still learning <Kbd>2</Kbd> got it
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <ProgressRing value={knownCount} max={Math.max(1, order.length)} size={112} stroke={10} tone={knownCount === order.length ? 'success' : 'blue'}>
            <span className="tabular font-display text-2xl font-extrabold text-heading">
              {knownCount}
              <span className="text-base text-muted">/{order.length}</span>
            </span>
          </ProgressRing>
          <h3 className="mt-4 text-xl font-bold">
            {knownCount === order.length ? (
              <>
                Every card, nailed
              </>
            ) : (
              'Round complete'
            )}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {missed.length
              ? `${pluralize(missed.length, 'card')} to go over again. A second round on just those makes them stick.`
              : 'Come back in a day or two to keep it fresh.'}
          </p>
          {assignment && (
            <p className={cn('mt-3 text-sm font-semibold', recorded ? 'text-success' : 'text-muted')}>
              {saving ? 'Saving your progress…' : recorded ? 'Marked as done for your chapter.' : firstPass ? '' : 'Your first round was recorded.'}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {missed.length > 0 && (
              <Button
                variant="accent"
                leftIcon={<RotateCcw className="size-4" />}
                onClick={() => {
                  setFirstPass(false);
                  reset(missed, true);
                }}
              >
                Study the {missed.length} missed
              </Button>
            )}
            <Button
              variant="outline"
              leftIcon={<Shuffle className="size-4" />}
              onClick={() => {
                setFirstPass(false);
                reset(deck.cards, true);
              }}
            >
              Shuffle and restart
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
