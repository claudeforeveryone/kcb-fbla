import { useMemo, useState } from 'react';
import { ArrowRight, Check, Play, RefreshCw, RotateCcw, X } from 'lucide-react';
import { Button, Kbd, ProgressRing, SegmentedControl, cn } from '../../components/ui';
import type { StudyDeck, VocabTerm } from '../../api/vocab';
import { distractors, shuffled } from './leitner';
import { recordReview } from './store';
import { SessionPanel, useHotkeys } from './parts';

type Direction = 'term' | 'def';
type Q = { term: VocabTerm; options: VocabTerm[] };

/** Multiple choice: see a term, pick its definition (or the reverse). Answers feed the spaced-repetition schedule. */
export function Quiz({ deck }: { deck: StudyDeck }) {
  const [dir, setDir] = useState<Direction>('term');
  const [size, setSize] = useState(Math.min(10, deck.terms.length));
  const [subset, setSubset] = useState<VocabTerm[] | null>(null);
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);

  if (!started) {
    const sizes = [10, 20, 30].filter((n) => n <= deck.terms.length);
    return (
      <SessionPanel
        eyebrow="Quiz"
        title="Test yourself"
        actions={
          <Button size="lg" leftIcon={<Play className="size-5" />} onClick={() => setStarted(true)}>
            Start quiz
          </Button>
        }
      >
        <p>Four choices per question, instant feedback, and every answer updates your review schedule.</p>
        <div className="mt-5 flex flex-col items-center gap-3">
          <SegmentedControl<Direction>
            aria-label="Question type"
            value={dir}
            onChange={setDir}
            options={[
              { value: 'term', label: 'Term to definition' },
              { value: 'def', label: 'Definition to term' },
            ]}
          />
          {sizes.length > 1 && (
            <SegmentedControl<number>
              aria-label="Questions"
              size="sm"
              value={size}
              onChange={setSize}
              options={[...sizes.map((n) => ({ value: n, label: `${n} questions` }))]}
            />
          )}
        </div>
      </SessionPanel>
    );
  }

  return (
    <Run
      key={run}
      deck={deck}
      dir={dir}
      terms={subset ?? shuffled(deck.terms).slice(0, size)}
      onRetry={(missed) => {
        setSubset(missed);
        setRun((r) => r + 1);
      }}
      onNew={() => {
        setSubset(null);
        setRun((r) => r + 1);
      }}
      onExit={() => {
        setSubset(null);
        setStarted(false);
      }}
    />
  );
}

function Run({
  deck,
  dir,
  terms,
  onRetry,
  onNew,
  onExit,
}: {
  deck: StudyDeck;
  dir: Direction;
  terms: VocabTerm[];
  onRetry: (missed: VocabTerm[]) => void;
  onNew: () => void;
  onExit: () => void;
}) {
  const questions = useMemo<Q[]>(
    () => terms.map((t) => ({ term: t, options: shuffled([t, ...distractors(t, deck.terms, 3)]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ q: Q; chosen: VocabTerm; correct: boolean }[]>([]);
  const q = questions[i];

  const choose = (idx: number) => {
    if (!q || picked !== null) return;
    const chosen = q.options[idx];
    const correct = chosen.id === q.term.id;
    setPicked(idx);
    recordReview(q.term.id, correct);
    setAnswers((a) => [...a, { q, chosen, correct }]);
  };
  const next = () => {
    setI((n) => n + 1);
    setPicked(null);
  };

  useHotkeys((e) => {
    if (!q) return;
    if (picked === null && /^[1-4]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      if (n < q.options.length) choose(n);
    } else if (picked !== null && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
      e.preventDefault();
      next();
    }
  });

  if (!q) {
    const right = answers.filter((a) => a.correct).length;
    const missed = answers.filter((a) => !a.correct);
    const pct = Math.round((right / answers.length) * 100);
    return (
      <div className="relative grid gap-5">
        <SessionPanel
          eyebrow="Quiz complete"
          title={pct === 100 ? 'Perfect score' : pct >= 80 ? 'Strong work' : pct >= 60 ? 'Getting there' : 'Keep at it'}
          actions={
            <>
              {missed.length > 0 && (
                <Button variant="accent" leftIcon={<RotateCcw className="size-4" />} onClick={() => onRetry(missed.map((m) => m.q.term))}>
                  Retry the {missed.length} missed
                </Button>
              )}
              <Button variant={missed.length ? 'outline' : 'primary'} leftIcon={<RefreshCw className="size-4" />} onClick={onNew}>
                New quiz
              </Button>
              <Button variant="ghost" onClick={onExit}>
                Settings
              </Button>
            </>
          }
        >
          <div className="flex justify-center">
            <ProgressRing value={right} max={answers.length} size={104} stroke={9} tone={pct >= 80 ? 'success' : pct >= 60 ? 'blue' : 'red'}>
              <span className="text-center leading-none">
                <span className="block text-2xl font-extrabold">{pct}%</span>
                <span className="block text-[11px] font-semibold text-muted">
                  {right}/{answers.length}
                </span>
              </span>
            </ProgressRing>
          </div>
        </SessionPanel>
        {missed.length > 0 && (
          <div className="mx-auto w-full max-w-2xl">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-muted">Review what you missed</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
              {missed.map((m) => (
                <li key={m.q.term.id} className="p-4">
                  <div className="font-display font-bold text-heading">{m.q.term.term}</div>
                  <p className="mt-1 text-sm text-ink">{m.q.term.def}</p>
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-red dark:text-danger">
                    <X className="mt-px size-3.5 shrink-0" />
                    <span>
                      You picked: <span className="text-muted">{dir === 'term' ? m.chosen.def : m.chosen.term}</span>
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const right = answers.filter((a) => a.correct).length;
  const isRight = picked !== null && q.options[picked].id === q.term.id;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="tabular font-display font-bold text-heading">
          {i + 1} <span className="font-semibold text-muted">/ {questions.length}</span>
        </span>
        <div className="flex flex-1 gap-1" aria-hidden>
          {questions.map((_, k) => (
            <span
              key={k}
              className={cn(
                'h-1 flex-1 rounded-none transition-colors duration-200',
                k < answers.length ? (answers[k].correct ? 'bg-success' : 'bg-red') : k === i ? 'bg-blue/50' : 'bg-surface-3',
              )}
            />
          ))}
        </div>
        <span className="tabular text-xs font-semibold text-success">{right} right</span>
        <Button variant="ghost" size="xs" onClick={onExit}>
          End
        </Button>
      </div>

      <div key={i} className="animate-slide-in rounded-[12px] border border-line bg-surface p-5 sm:p-7">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {dir === 'term' ? 'Which definition matches?' : 'Which term is this?'}
        </span>
        {dir === 'term' ? (
          <h2 className="mt-3 text-center font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{q.term.term}</h2>
        ) : (
          <p className="mt-3 text-center text-lg leading-relaxed text-heading sm:text-xl">{q.term.def}</p>
        )}
        <div className="mt-6 grid gap-2" role="group" aria-label="Choices">
          {q.options.map((o, idx) => {
            const correct = o.id === q.term.id;
            const state = picked === null ? 'idle' : correct ? 'right' : picked === idx ? 'wrong' : 'dim';
            return (
              <button
                key={o.id}
                type="button"
                disabled={picked !== null}
                onClick={() => choose(idx)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[8px] border px-3.5 py-3 text-left leading-snug transition-[border-color,background-color,opacity] duration-150',
                  dir === 'def' ? 'font-display font-semibold text-heading' : 'text-[0.9375rem]',
                  state === 'idle' && 'border-line-strong bg-surface hover:border-blue/60 hover:bg-surface-2',
                  state === 'right' && 'border-success bg-success/10',
                  state === 'wrong' && 'border-red bg-red/8 [animation:vocab-shake_320ms_ease-in-out]',
                  state === 'dim' && 'border-line opacity-55',
                )}
              >
                <span
                  className={cn(
                    'tabular mt-px grid size-6 shrink-0 place-items-center rounded-[2px] font-sans text-xs font-bold',
                    state === 'right' ? 'bg-success text-white' : state === 'wrong' ? 'bg-red text-white' : 'bg-surface-2 text-muted',
                  )}
                >
                  {state === 'right' ? <Check className="size-3.5" /> : state === 'wrong' ? <X className="size-3.5" /> : idx + 1}
                </span>
                <span>{dir === 'term' ? o.def : o.term}</span>
              </button>
            );
          })}
        </div>
      </div>

      {picked !== null ? (
        <div className="animate-rise flex items-center justify-between gap-3">
          <p className={cn('font-display font-bold', isRight ? 'text-success' : 'text-red dark:text-danger')}>
            {isRight ? 'Correct' : `It was "${q.term.term}"`}
          </p>
          <Button onClick={next} rightIcon={<ArrowRight className="size-4" />}>
            {i + 1 === questions.length ? 'See results' : 'Next'}
          </Button>
        </div>
      ) : (
        <p className="hidden items-center justify-center gap-3 text-xs text-muted md:flex">
          <span className="flex items-center gap-1">
            <Kbd>1</Kbd>-<Kbd>4</Kbd> choose
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> next
          </span>
        </p>
      )}
    </div>
  );
}
