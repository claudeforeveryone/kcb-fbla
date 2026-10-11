import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, RefreshCw, RotateCcw, Shuffle, Undo2, X } from 'lucide-react';
import { Button, Kbd, SegmentedControl, cn } from '../../components/ui';
import type { StudyDeck, VocabTerm } from '../../api/vocab';
import { shuffled, statusOf, type ProgressLike } from './leitner';
import { recordReview } from './store';
import { MiniStat, SessionPanel, StatusChip, useHotkeys } from './parts';

type Front = 'term' | 'def';
type Scope = 'all' | 'unmastered';
const SWIPE = 110;

export function Flashcards({ deck, progress }: { deck: StudyDeck; progress: ReadonlyMap<string, ProgressLike> }) {
  const [front, setFront] = useState<Front>('term');
  const [scope, setScope] = useState<Scope>('all');
  const [shuffle, setShuffle] = useState(true);
  const [run, setRun] = useState(0);
  const [only, setOnly] = useState<VocabTerm[] | null>(null);

  const unmastered = useMemo(
    () => deck.terms.filter((t) => statusOf(progress.get(t.id)) !== 'mastered'),
    // only recompute between runs so the pool doesn't shift under the player
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.terms, run],
  );
  const queue = useMemo(() => {
    const base = only ?? (scope === 'unmastered' && unmastered.length ? unmastered : deck.terms);
    return shuffle ? shuffled(base) : [...base];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, only, scope, shuffle, deck.terms]);

  const restart = (subset: VocabTerm[] | null) => {
    setOnly(subset);
    setRun((r) => r + 1);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Front>
          size="sm"
          aria-label="Card front"
          value={front}
          onChange={setFront}
          options={[
            { value: 'term', label: 'Term first' },
            { value: 'def', label: 'Definition first' },
          ]}
        />
        <SegmentedControl<Scope>
          size="sm"
          aria-label="Which cards"
          value={only ? 'all' : scope}
          onChange={(v) => {
            setScope(v);
            restart(null);
          }}
          options={[
            { value: 'all', label: `All ${deck.terms.length}` },
            { value: 'unmastered', label: `Not mastered ${unmastered.length}`, disabled: !unmastered.length },
          ]}
        />
        <Button
          size="sm"
          variant={shuffle ? 'secondary' : 'outline'}
          aria-pressed={shuffle}
          leftIcon={<Shuffle className="size-4" />}
          onClick={() => {
            setShuffle((s) => !s);
            setRun((r) => r + 1);
          }}
        >
          Shuffle
        </Button>
      </div>
      <Session
        key={`${run}-${front}`}
        queue={queue}
        front={front}
        progress={progress}
        onRestart={(subset) => restart(subset)}
      />
    </div>
  );
}

function Session({
  queue,
  front,
  progress,
  onRestart,
}: {
  queue: VocabTerm[];
  front: Front;
  progress: ReadonlyMap<string, ProgressLike>;
  onRestart: (subset: VocabTerm[] | null) => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<null | 'left' | 'right'>(null);
  const [known, setKnown] = useState<VocabTerm[]>([]);
  const [again, setAgain] = useState<VocabTerm[]>([]);
  const [history, setHistory] = useState<('k' | 'a')[]>([]);
  const start = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // take keyboard focus so Space and the arrow keys drive the cards, not the mode tabs
  useEffect(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || a.getAttribute("role") === "tab" || a.closest("[role=radiogroup]")) cardRef.current?.focus({ preventScroll: true });
  }, [i]);

  const card = queue[i];
  const done = i >= queue.length;

  const decide = (dir: 'left' | 'right') => {
    if (!card || leaving) return;
    setLeaving(dir);
    recordReview(card.id, dir === 'right');
    if (dir === 'right') setKnown((k) => [...k, card]);
    else setAgain((a) => [...a, card]);
    setHistory((h) => [...h, dir === 'right' ? 'k' : 'a']);
    window.setTimeout(() => {
      setI((n) => n + 1);
      setFlipped(false);
      setDx(0);
      setLeaving(null);
    }, 230);
  };

  // Undo only steps back through the deck; the review already recorded stays (a fresh answer overwrites it next time).
  const back = () => {
    if (i === 0 || leaving) return;
    const last = history[history.length - 1];
    if (last === 'k') setKnown((k) => k.slice(0, -1));
    if (last === 'a') setAgain((a) => a.slice(0, -1));
    setHistory((h) => h.slice(0, -1));
    setI((n) => n - 1);
    setFlipped(false);
  };

  useHotkeys((e) => {
    if (done) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFlipped((f) => !f);
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      decide('right');
    } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
      e.preventDefault();
      decide('left');
    } else if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') {
      back();
    }
  });

  const onDown = (e: ReactPointerEvent) => {
    if (leaving) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  };
  const onMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    if (!s.moved && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(e.clientY - s.y)) {
      s.moved = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.moved) setDx(mx);
  };
  const onUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    setDragging(false);
    if (!s.moved) {
      setFlipped((f) => !f);
      return;
    }
    const mx = e.clientX - s.x;
    if (Math.abs(mx) > SWIPE) decide(mx > 0 ? 'right' : 'left');
    else setDx(0);
  };

  if (done) {
    const pct = queue.length ? Math.round((known.length / queue.length) * 100) : 0;
    return (
      <SessionPanel
        tone={again.length ? 'navy' : 'success'}
        eyebrow="Round complete"
        title={again.length ? `${known.length} of ${queue.length} known` : 'You knew every card'}
        actions={
          <>
            {again.length > 0 && (
              <Button variant="accent" leftIcon={<RotateCcw className="size-4" />} onClick={() => onRestart(again)}>
                Study the {again.length} again
              </Button>
            )}
            <Button variant={again.length ? 'outline' : 'primary'} leftIcon={<RefreshCw className="size-4" />} onClick={() => onRestart(null)}>
              New round
            </Button>
          </>
        }
      >
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
          <MiniStat label="Know it" value={known.length} tone="success" />
          <MiniStat label="Again" value={again.length} tone="red" />
          <MiniStat label="Score" value={`${pct}%`} />
        </div>
        <p className="mt-4 text-sm">Every swipe updates your spaced-repetition schedule.</p>
      </SessionPanel>
    );
  }

  const status = statusOf(progress.get(card.id));
  const tilt = leaving ? (leaving === 'right' ? 1 : -1) * 600 : dx;
  const hint = Math.min(1, Math.abs(dx) / SWIPE);
  const frontText = front === 'term' ? card.term : card.def;
  const backText = front === 'term' ? card.def : card.term;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="tabular font-display font-bold text-heading">
          {i + 1} <span className="font-semibold text-muted">/ {queue.length}</span>
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-none bg-surface-3">
          <div className="h-full bg-[var(--ev,var(--blue))] transition-[width] duration-300" style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
        <span className="tabular flex items-center gap-2 text-xs font-semibold">
          <span className="text-success">{known.length} known</span>
          <span className="text-red dark:text-danger">{again.length} again</span>
        </span>
      </div>

      <div className="relative [perspective:1400px]">
        {/* the next card peeking underneath */}
        {queue[i + 1] && (
          <div
            className="absolute inset-0 translate-y-2 scale-[0.97] rounded-[4px] border border-line bg-surface opacity-70"
            aria-hidden
          />
        )}
        <div
          ref={cardRef}
          role="button"
          tabIndex={0}
          aria-label={flipped ? `Back: ${backText}. Press space to flip.` : `Front: ${frontText}. Press space to flip.`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
          className="relative h-[min(58vh,360px)] cursor-grab touch-pan-y select-none rounded-[4px] active:cursor-grabbing"
          style={{
            transform: `translateX(${tilt}px) rotate(${tilt / 22}deg)`,
            transition: dragging ? 'none' : 'transform 230ms cubic-bezier(0.22,1,0.36,1), opacity 230ms ease-out',
            opacity: leaving ? 0 : 1,
          }}
        >
          <div
            className="relative h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d]"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
          >
            <Face side="front" label={front === 'term' ? 'Term' : 'Definition'} big={front === 'term'} status={status}>
              {frontText}
            </Face>
            <Face side="back" label={front === 'term' ? 'Definition' : 'Term'} big={front !== 'term'} status={status}>
              {backText}
            </Face>
          </div>
          {/* swipe verdict overlays */}
          <div
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-[4px] border-2 border-success bg-success/10"
            style={{ opacity: dx > 0 ? hint : leaving === 'right' ? 1 : 0 }}
            aria-hidden
          >
            <span className="rounded-[2px] border-2 border-success px-3 py-1 font-display text-xl font-extrabold uppercase tracking-wider text-success">
              Know it
            </span>
          </div>
          <div
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-[4px] border-2 border-red bg-red/10"
            style={{ opacity: dx < 0 ? hint : leaving === 'left' ? 1 : 0 }}
            aria-hidden
          >
            <span className="rounded-[2px] border-2 border-red px-3 py-1 font-display text-xl font-extrabold uppercase tracking-wider text-red dark:text-danger">
              Again
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous card" title="Previous card (Z)" disabled={i === 0} onClick={back}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="outline" size="lg" className="text-red hover:border-red/50 dark:text-danger" leftIcon={<X className="size-5" />} onClick={() => decide('left')}>
          Again
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-success hover:border-success/50"
          leftIcon={<Check className="size-5" />}
          onClick={() => decide('right')}
        >
          Know it
        </Button>
      </div>
      <p className="hidden items-center justify-center gap-3 text-xs text-muted md:flex">
        <span className="flex items-center gap-1">
          <Kbd>Space</Kbd> flip
        </span>
        <span className="flex items-center gap-1">
          <Kbd>←</Kbd> again
        </span>
        <span className="flex items-center gap-1">
          <Kbd>→</Kbd> know it
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Z</Kbd> back
        </span>
      </p>
      <p className="text-center text-xs text-muted md:hidden">Tap to flip. Swipe right if you knew it, left to see it again.</p>
    </div>
  );
}

function Face({
  side,
  label,
  big,
  status,
  children,
}: {
  side: 'front' | 'back';
  label: string;
  big: boolean;
  status: ReturnType<typeof statusOf>;
  children: string;
}) {
  const long = children.length > 140;
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col overflow-hidden rounded-[4px] border p-5 [backface-visibility:hidden] sm:p-7',
        side === 'front' ? 'border-line bg-surface' : 'border-navy/20 bg-surface dark:border-blue/30',
      )}
      style={side === 'back' ? { transform: 'rotateY(180deg)' } : undefined}
    >
      {side === 'back' && <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--ev,var(--red))]" aria-hidden />}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
        <StatusChip status={status} />
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto py-3 text-center">
        <p
          className={cn(
            'text-pretty text-heading',
            big
              ? 'font-display text-2xl font-extrabold tracking-tight sm:text-4xl'
              : long
                ? 'text-base leading-relaxed sm:text-lg'
                : 'text-lg leading-relaxed sm:text-xl',
          )}
        >
          {children}
        </p>
      </div>
      <div className="text-center text-[11px] font-semibold text-muted/80">{side === 'front' ? 'Tap to reveal' : 'Tap to flip back'}</div>
    </div>
  );
}
