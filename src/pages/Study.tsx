import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, X, Star } from "lucide-react";
import { useStore } from "../state";
import { useTerms } from "./Vocab";
import {
  buildDeck,
  DECK_FILTERS,
  dayKey,
  daySummary,
  NEW_TARGET,
  shuffle,
  type DeckFilter,
  type Term,
} from "../lib/srs";
import { Empty, Loading, Page, pct } from "../components/ui";

type Result = { term: Term; correct: boolean };

export default function Study() {
  const [sp] = useSearchParams();
  const store = useStore();
  const terms = useTerms();
  const mode = sp.get("mode") === "flip" ? "flip" : "match";
  // the round is fixed when the page opens so answering doesn't reshuffle the deck under you
  const [round, setRound] = useState<Term[] | null>(null);
  useEffect(() => {
    if (round || !terms.length || store.phase !== "in") return;
    const today = dayKey(new Date());
    const deck = buildDeck(terms, store.d.srs, {
      filter: DECK_FILTERS.some((f) => f.id === sp.get("deck"))
        ? (sp.get("deck") as DeckFilter)
        : "smart",
      topics: (sp.get("topics") || "").split(",").filter(Boolean),
      today,
      newTarget: NEW_TARGET,
      newDoneToday: daySummary(store.logs.reviews, today).newDone,
    });
    const n = Math.max(1, Number(sp.get("n")) || 20);
    // due and missed first (already ordered), shuffled inside the round
    setRound(shuffle(deck.slice(0, n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms.length, store.phase]);

  if (!round) return <Loading label="Shuffling the deck" />;
  if (!round.length)
    return (
      <Page title="Vocab">
        <Empty
          title="This deck is empty"
          action={
            <Link className="btn btn-primary" to="/vocab">
              Change the deck
            </Link>
          }
        >
          Nothing matches that deck and topic right now.
        </Empty>
      </Page>
    );
  return <Round mode={mode} round={round} all={terms} />;
}

function Round({
  mode,
  round,
  all,
}: {
  mode: "flip" | "match";
  round: Term[];
  all: Term[];
}) {
  const { recordReview } = useStore();
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = useRef(performance.now());
  const t = round[i];
  const done = i >= round.length;

  // four terms: the answer plus three from the same event where possible
  const options = useMemo(() => {
    if (!t || mode !== "match") return [];
    const same = all.filter(
      (x) =>
        x.id !== t.id &&
        x.topic === t.topic &&
        x.term.toLowerCase() !== t.term.toLowerCase(),
    );
    const other = all.filter((x) => x.id !== t.id && x.topic !== t.topic);
    const pool = shuffle(same.length >= 3 ? same : [...same, ...other]).slice(
      0,
      3,
    );
    return shuffle([t, ...pool]);
  }, [t, mode, all]);

  const answer = useCallback(
    (correct: boolean) => {
      if (!t) return;
      recordReview(t.id, correct, performance.now() - shown.current);
      setResults((r) => [...r, { term: t, correct }]);
    },
    [t, recordReview],
  );

  const next = useCallback(() => {
    setI((x) => x + 1);
    setFlipped(false);
    setPicked(null);
    shown.current = performance.now();
  }, []);

  const pick = useCallback(
    (x: Term) => {
      if (picked) return;
      setPicked(x.id);
      answer(x.id === t.id);
    },
    [picked, answer, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done || e.metaKey || e.ctrlKey) return;
      if (mode === "flip") {
        if ((e.key === " " || e.key === "Enter") && !flipped) {
          e.preventDefault();
          setFlipped(true);
        } else if (flipped && (e.key === "1" || e.key === "ArrowLeft")) {
          answer(false);
          next();
        } else if (flipped && (e.key === "2" || e.key === "ArrowRight")) {
          answer(true);
          next();
        }
      } else {
        const n = "1234".indexOf(e.key);
        if (n >= 0 && options[n] && !picked) pick(options[n]);
        else if (picked && (e.key === "Enter" || e.key === "ArrowRight")) {
          e.preventDefault();
          next();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, mode, flipped, picked, options, answer, next, pick]);

  if (done) return <Summary results={results} mode={mode} />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-6 md:px-8 md:pt-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="display text-3xl">
            {mode === "flip" ? "Flip" : "Match"}
          </div>
          <div className="num text-sm text-ink-2">
            Card {i + 1} of {round.length} ·{" "}
            {results.filter((r) => r.correct).length} right
          </div>
        </div>
        <Link to="/vocab" className="btn min-h-10 px-3 text-sm">
          Stop
        </Link>
      </div>
      <div className="bar mb-6" aria-hidden>
        <span style={{ width: `${(i / round.length) * 100}%` }} />
      </div>

      {mode === "flip" ? (
        <>
          <button
            className="flip block w-full text-left"
            onClick={() => setFlipped((f) => !f)}
            aria-label={
              flipped ? "Show the term" : "Flip to see the definition"
            }
          >
            <div className="flip-inner min-h-72" data-flipped={flipped}>
              <div className="flip-face panel flex min-h-72 flex-col items-center justify-center p-6 text-center">
                <span className="label mb-3">Term</span>
                <span className="display text-4xl md:text-5xl">{t.term}</span>
                <span className="mt-6 text-sm text-ink-2">
                  Say the definition, then tap to flip
                </span>
              </div>
              <div className="flip-face flip-back panel flex min-h-72 flex-col justify-center bg-card p-6">
                <span className="label mb-2">{t.term}</span>
                <span className="text-lg md:text-xl">{t.def}</span>
              </div>
            </div>
          </button>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              className="btn min-h-14 border-danger text-danger"
              disabled={!flipped}
              onClick={() => {
                answer(false);
                next();
              }}
            >
              <X size={18} /> Missed it
            </button>
            <button
              className="btn min-h-14 border-ok text-ok"
              disabled={!flipped}
              onClick={() => {
                answer(true);
                next();
              }}
            >
              <Check size={18} /> Got it
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="panel p-5">
            <span className="label">Definition</span>
            <p className="mt-2 text-lg md:text-xl">{t.def}</p>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {options.map((x, n) => {
              const right = x.id === t.id;
              const tone = !picked
                ? "border-rule-strong hover:border-ink hover:bg-band"
                : right
                  ? "border-ok bg-ok-band"
                  : picked === x.id
                    ? "border-danger bg-danger-band"
                    : "border-rule opacity-60";
              return (
                <li key={x.id}>
                  <button
                    className={
                      "flex min-h-14 w-full items-center gap-3 border px-3 py-2 text-left font-semibold " +
                      tone
                    }
                    onClick={() => pick(x)}
                    disabled={!!picked}
                  >
                    <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center border border-current text-sm">
                      {n + 1}
                    </span>
                    {x.term}
                  </button>
                </li>
              );
            })}
          </ol>
          {picked && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span
                className={
                  picked === t.id
                    ? "font-semibold text-ok"
                    : "font-semibold text-danger"
                }
              >
                {picked === t.id ? "Right." : `It's ${t.term}.`}
              </span>
              <button className="btn btn-primary" onClick={next} autoFocus>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ results, mode }: { results: Result[]; mode: string }) {
  const { addWord, words, setNote } = useStore();
  const right = results.filter((r) => r.correct).length;
  const misses = results.filter((r) => !r.correct);
  const saved = new Set(words.map((w) => w.ref));
  const save = (t: Term) =>
    addWord({ term: t.term, def: t.def, ref: t.id }).catch(() =>
      setNote("Could not save that word. Try again."),
    );
  return (
    <Page
      title={`${right} / ${results.length}`}
      sub={`${mode === "flip" ? "Flip" : "Match"} round · ${pct(results.length ? right / results.length : 0)} right`}
    >
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary" to="/vocab">
          Back to Cards
        </Link>
        <Link
          className="btn"
          to={location.pathname + location.search}
          reloadDocument
        >
          Another round
        </Link>
      </div>
      {misses.length > 0 && (
        <section className="mt-8">
          <h2 className="display mb-3 text-2xl">Missed this round</h2>
          <ul className="border-t border-rule">
            {misses.map(({ term: t }) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-3 border-b border-rule py-3"
              >
                <div>
                  <b>{t.term}</b>
                  <p className="text-ink-2">{t.def}</p>
                </div>
                {!t.mine && (
                  <button
                    className="btn min-h-10 shrink-0 px-3 text-sm"
                    onClick={() => save(t)}
                    disabled={saved.has(t.id)}
                    aria-label={`Save ${t.term} to My Words`}
                  >
                    <Star
                      size={16}
                      fill={saved.has(t.id) ? "currentColor" : "none"}
                    />{" "}
                    {saved.has(t.id) ? "Saved" : "Save"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
