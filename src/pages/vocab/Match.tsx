import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, Timer, Trophy, Zap } from 'lucide-react';
import { Badge, Button, SegmentedControl, cn } from '../../components/ui';
import type { StudyDeck } from '../../api/vocab';
import { shuffled } from './leitner';
import { getMatchBest, setMatchBest } from './store';
import { Burst, MiniStat, SessionPanel, formatMs } from './parts';

type Tile = { key: string; pair: string; text: string; kind: 'term' | 'def' };
const PENALTY = 1000;

/** Timed tile matching: clear every term/definition pair as fast as you can. A wrong pair adds a second. */
export function Match({ deck }: { deck: StudyDeck }) {
  const maxPairs = Math.min(8, deck.terms.length);
  const [pairs, setPairs] = useState(Math.min(6, maxPairs));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'play'>('ready');
  const bestKey = `${deck.key}:${pairs}`;
  const [best, setBest] = useState<number | null>(() => getMatchBest(bestKey));
  useEffect(() => setBest(getMatchBest(bestKey)), [bestKey]);

  if (phase === 'ready') {
    return (
      <SessionPanel
        icon={<Zap />}
        eyebrow="Match"
        title="Race the clock"
        actions={
          <Button size="lg" leftIcon={<Play className="size-5" />} onClick={() => setPhase('play')}>
            Start
          </Button>
        }
      >
        <p>Tap a term, then its definition. Clear the board as fast as you can. A wrong pair costs a second.</p>
        <div className="mt-5 flex flex-col items-center gap-3">
          {maxPairs > 4 && (
            <SegmentedControl<number>
              aria-label="Board size"
              value={pairs}
              onChange={setPairs}
              options={[4, 6, 8]
                .filter((n) => n < maxPairs)
                .concat(maxPairs)
                .map((n) => ({ value: n, label: `${n} pairs` }))}
            />
          )}
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="size-4 text-warning" />
            {best != null ? (
              <span>
                Your best: <strong className="tabular text-heading">{formatMs(best)}</strong>
              </span>
            ) : (
              <span>No best time yet on this board</span>
            )}
          </div>
        </div>
      </SessionPanel>
    );
  }

  return (
    <Board
      key={round}
      deck={deck}
      pairs={pairs}
      best={best}
      onFinish={(ms) => {
        if (best == null || ms < best) {
          setMatchBest(bestKey, ms);
          setBest(ms);
          return true;
        }
        return false;
      }}
      onReplay={() => setRound((r) => r + 1)}
      onExit={() => setPhase('ready')}
    />
  );
}

function Board({
  deck,
  pairs,
  best,
  onFinish,
  onReplay,
  onExit,
}: {
  deck: StudyDeck;
  pairs: number;
  best: number | null;
  onFinish: (ms: number) => boolean;
  onReplay: () => void;
  onExit: () => void;
}) {
  const tiles = useMemo<Tile[]>(() => {
    const pick = shuffled(deck.terms).slice(0, pairs);
    return shuffled(
      pick.flatMap((t) => [
        { key: `${t.id}:t`, pair: t.id, text: t.term, kind: 'term' as const },
        { key: `${t.id}:d`, pair: t.id, text: t.def, kind: 'def' as const },
      ]),
    );
  }, [deck.terms, pairs]);

  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState(0);
  const startRef = useRef(performance.now());
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ ms: number; record: boolean } | null>(null);

  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => setNow(performance.now() - startRef.current), 100);
    return () => window.clearInterval(id);
  }, [result]);

  const tap = (t: Tile) => {
    if (result || matched.has(t.pair) || wrong) return;
    if (!sel) return setSel(t.key);
    if (sel === t.key) return setSel(null);
    const first = tiles.find((x) => x.key === sel)!;
    if (first.kind === t.kind) return setSel(t.key);
    if (first.pair === t.pair) {
      const m = new Set(matched).add(t.pair);
      setMatched(m);
      setSel(null);
      window.setTimeout(() => setGone((g) => new Set(g).add(t.pair)), 380);
      if (m.size === pairs) {
        const ms = Math.round(performance.now() - startRef.current + misses * PENALTY);
        setNow(ms);
        setResult({ ms, record: onFinish(ms) });
      }
    } else {
      setWrong([sel, t.key]);
      setMisses((n) => n + 1);
      setFlash((f) => f + 1);
      setSel(null);
      window.setTimeout(() => setWrong(null), 420);
    }
  };

  const shown = result ? result.ms : now + misses * PENALTY;

  if (result) {
    const accuracy = Math.round((pairs / (pairs + misses)) * 100);
    return (
      <div className="relative">
        {result.record && <Burst />}
        <SessionPanel
          icon={<Trophy />}
          tone={result.record ? 'success' : 'navy'}
          eyebrow={result.record ? 'New best time' : 'Board cleared'}
          title={<span className="tabular">{formatMs(result.ms)}</span>}
          actions={
            <>
              <Button leftIcon={<RefreshCw className="size-4" />} onClick={onReplay}>
                Play again
              </Button>
              <Button variant="outline" onClick={onExit}>
                Change board
              </Button>
            </>
          }
        >
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
            <MiniStat label="Pairs" value={pairs} />
            <MiniStat label="Misses" value={misses} tone={misses ? 'red' : 'success'} />
            <MiniStat label="Accuracy" value={`${accuracy}%`} tone="blue" />
          </div>
          {!result.record && best != null && (
            <p className="mt-4 text-sm">
              <strong className="tabular text-heading">{formatMs(result.ms - best)}</strong> off your best of{' '}
              <strong className="tabular text-heading">{formatMs(best)}</strong>.
            </p>
          )}
        </SessionPanel>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-navy text-white dark:bg-blue">
            <Timer className="size-4" />
          </span>
          <span className="tabular min-w-[4.5rem] font-display text-2xl font-extrabold text-heading" aria-live="off">
            {formatMs(shown)}
          </span>
          {flash > 0 && (
            <span
              key={flash}
              className="tabular absolute left-1/2 top-0 text-sm font-bold text-red dark:text-danger"
              style={{ animation: 'vocab-float-up 800ms ease-out both' }}
              aria-hidden
            >
              +1s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success" className="tabular">
            {matched.size} / {pairs}
          </Badge>
          {best != null && (
            <Badge tone="warning" className="tabular hidden sm:inline-flex">
              Best {formatMs(best)}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onExit}>
            Quit
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="group" aria-label="Match tiles">
        {tiles.map((t) => {
          const isMatched = matched.has(t.pair);
          const isGone = gone.has(t.pair);
          const isSel = sel === t.key;
          const isWrong = !!wrong && wrong.includes(t.key);
          if (isGone) return <div key={t.key} className="min-h-24 rounded-xl border border-dashed border-line/70" aria-hidden />;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => tap(t)}
              aria-pressed={isSel}
              disabled={isMatched}
              className={cn(
                'flex min-h-24 items-center justify-center rounded-xl border-2 p-3 text-center transition-[transform,border-color,background-color,box-shadow] duration-150',
                t.kind === 'term'
                  ? 'font-display text-[0.9375rem] font-bold text-heading'
                  : 'text-[0.8125rem] leading-snug text-ink',
                !isSel && !isWrong && !isMatched && 'border-line bg-surface shadow-card hover:-translate-y-0.5 hover:border-blue/50 hover:shadow-lift',
                isSel && '-translate-y-0.5 border-blue bg-blue/8 shadow-lift ring-4 ring-blue/15',
                isWrong && 'border-red bg-red/8 [animation:vocab-shake_320ms_ease-in-out]',
                isMatched && 'border-success bg-success/12 [animation:vocab-match-out_380ms_ease-out_both]',
              )}
            >
              {t.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
