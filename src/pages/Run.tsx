import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, X, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useStore } from "../state";
import {
  loadMany,
  loadQuestions,
  paperIds,
  PAPERS,
  type PaperId,
  type Question,
} from "../lib/content";
import { practiceSet, weakSet, nextEndless } from "../lib/pick";
import { seeded, shuffle } from "../lib/srs";
import {
  Empty,
  Loading,
  Page,
  clock,
  int,
  pct,
  secs,
  signed,
} from "../components/ui";
import type { Resume } from "../lib/backend";

type Kind = "paper" | "mock" | "practice" | "weak" | "fix" | "endless" | "duel";
const TESTS = new Set<Kind>(["paper", "mock", "duel"]); // no feedback until the end, like the real thing
const LETTERS = ["A", "B", "C", "D"];

type Setup = {
  qs: Map<string, Question>;
  pool: Question[];
  ids: string[];
  label: string;
  minutes: number | null;
  duelId?: string;
  picks?: (number | null)[];
};

export default function Run() {
  const [sp] = useSearchParams();
  const store = useStore();
  const { me, logs, topicBy, topics } = store;
  const resumeRef = useRef<Resume | null>(
    sp.has("resume") ? (me?.resume ?? null) : null,
  );
  const resume = resumeRef.current;
  const params = useMemo(
    () => new URLSearchParams(resume ? resume.params : sp.toString()),
    [resume, sp],
  );
  const kind = (params.get("kind") || "practice") as Kind;
  const topic = params.get("topic");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    if (!topics.length) return;
    let off = false;
    (async () => {
      const duel =
        kind === "duel" ? logs.duels.find((x) => x.id === params.get("id")) : undefined;
      if (kind === "duel" && !duel) {
        setFail("That 1v1 could not be found.");
        return;
      }
      const slugs = duel
        ? [duel.topic]
        : !topic || topic === "all" || kind === "fix"
          ? topics.map((t) => t.slug)
          : [topic];
      const pool =
        slugs.length === 1
          ? await loadQuestions(slugs[0])
          : await loadMany(slugs);
      const qs = new Map(pool.map((q) => [q.id, q]));
      const name =
        topic && topic !== "all"
          ? (topicBy(topic)?.name ?? topic)
          : "All events";
      let ids: string[] = [],
        label = "",
        minutes: number | null = null,
        picks: (number | null)[] | undefined,
        duelId: string | undefined;
      if (resume) {
        // a question removed from a bank since: drop it and its pick together so answers stay aligned
        const keep = resume.ids.map((id) => qs.has(id));
        ids = resume.ids.filter((_, i) => keep[i]);
        picks = resume.picks.filter((_, i) => keep[i]);
        label = resume.label;
        minutes =
          kind === "paper"
            ? (PAPERS.find((p) => p.id === params.get("paper"))?.minutes ??
              null)
            : kind === "mock"
              ? 50
              : null;
      } else if (kind === "paper") {
        const p = PAPERS.find((x) => x.id === params.get("paper")) ?? PAPERS[2];
        ids = paperIds(pool, topic!, p.id as PaperId);
        label = `${name} · ${p.label}`;
        minutes = p.minutes;
      } else if (kind === "mock") {
        ids = shuffle(pool.map((q) => q.id)).slice(0, 100);
        label = `${name} · Mock exam`;
        minutes = 50;
      } else if (kind === "practice") {
        const sub = params.get("sub") || undefined;
        ids = practiceSet(pool, logs.answers, 20, sub).map((q) => q.id);
        label = `Practice · ${sub ?? name}`;
      } else if (kind === "weak") {
        ids = weakSet(pool, logs.answers, 20).map((q) => q.id);
        label = `Weak spots · ${name}`;
      } else if (kind === "fix") {
        ids = store.d.mastery.openMisses
          .filter((id) => qs.has(id))
          .slice(0, 30);
        label = "Fix your misses";
      } else if (kind === "endless") {
        const first = nextEndless(pool, logs.answers, new Set());
        ids = first ? [first.id] : [];
        label = `Endless · ${name}`;
      } else if (kind === "duel") {
        const d = duel!;
        ids = shuffle(pool.map((q) => q.id).sort(), seeded(d.seed)).slice(
          0,
          d.size,
        );
        const other = store.profiles.find(
          (p) => p.id === (d.challenger === me?.id ? d.opponent : d.challenger),
        );
        label = `1v1 vs ${other?.name ?? "a member"} · ${topicBy(d.topic)?.name ?? d.topic}`;
        duelId = d.id;
      }
      if (!off) setSetup({ qs, pool, ids, label, minutes, duelId, picks });
    })().catch(
      () =>
        !off &&
        setFail(
          "Could not load these questions. Check your connection and try again.",
        ),
    );
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.length, params]);

  if (fail)
    return (
      <Page>
        <Empty
          title="Something went wrong"
          action={
            <Link className="btn" to="/play">
              Back to Play
            </Link>
          }
        >
          {fail}
        </Empty>
      </Page>
    );
  if (!setup) return <Loading label="Setting out the paper" />;
  if (!setup.ids.length) {
    const msg =
      kind === "weak"
        ? "No weak spots yet. Answer a few questions and your misses will collect here."
        : kind === "fix"
          ? "No open misses. Every question you missed, you have since answered right."
          : "There are no questions left to draw here.";
    return (
      <Page>
        <Empty
          title={kind === "fix" ? "All clear" : "Nothing to drill yet"}
          action={
            <Link className="btn btn-primary" to="/play">
              Back to Play
            </Link>
          }
        >
          {msg}
        </Empty>
      </Page>
    );
  }
  return (
    <Session
      key={setup.label + setup.ids[0]}
      kind={kind}
      params={params}
      setup={setup}
      resume={resume}
    />
  );
}

function Session({
  kind,
  params,
  setup,
  resume,
}: {
  kind: Kind;
  params: URLSearchParams;
  setup: Setup;
  resume: Resume | null;
}) {
  const store = useStore();
  const nav = useNavigate();
  const test = TESTS.has(kind);
  const [ids, setIds] = useState<string[]>(setup.ids);
  const [idx, setIdx] = useState(Math.min(resume?.idx ?? 0, setup.ids.length - 1));
  const [picks, setPicks] = useState<(number | null)[]>(
    () => setup.picks ?? setup.ids.map(() => null),
  );
  const times = useRef<number[]>(setup.ids.map(() => 0));
  const shownAt = useRef(performance.now());
  const startedAt = useRef(Date.now() - (resume?.elapsedMs ?? 0));
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<null | { before: number; ms: number }>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const ratingBefore = useRef(store.d.rating);

  const q = setup.qs.get(ids[idx])!;
  const revealed = !test && picks[idx] !== null;
  const elapsed = now - startedAt.current;
  const remaining = setup.minutes ? setup.minutes * 60000 - elapsed : null;

  // time spent on the question on screen
  const bank = useCallback(() => {
    const t = performance.now();
    times.current[idx] = (times.current[idx] ?? 0) + (t - shownAt.current);
    shownAt.current = t;
  }, [idx]);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [idx]);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [done]);

  // keep an unfinished session so "Keep going" can pick it up (1v1s excluded: they're one sitting)
  useEffect(() => {
    if (done || kind === "duel") return;
    if (!test && picks.every((p) => p === null) && idx === 0) return;
    store.setResume({
      kind,
      topic: params.get("topic"),
      label: setup.label,
      params: params.toString(),
      ids,
      picks,
      idx,
      elapsedMs: Date.now() - startedAt.current,
      savedAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, picks, done]);

  const finish = useCallback(() => {
    if (done) return;
    bank();
    const before = ratingBefore.current;
    const ms = Date.now() - startedAt.current;
    if (test) {
      store.recordAnswers(
        ids.map((id, i) => ({
          q: setup.qs.get(id)!,
          pick: picks[i],
          ms: times.current[i] ?? 0,
        })),
        kind,
      );
      const correct = ids.filter(
        (id, i) => picks[i] === setup.qs.get(id)!.answer,
      ).length;
      if (kind === "paper" || kind === "mock") {
        store.recordPaper({
          kind,
          topic: params.get("topic"),
          label: setup.label,
          total: ids.length,
          correct,
          ms,
        });
      }
      if (kind === "duel" && setup.duelId) {
        store.backend
          ?.postDuel(setup.duelId, correct, ms)
          .then(() => store.refresh())
          .catch(() =>
            store.setNote("Your 1v1 score did not post. Try again from Play."),
          );
      }
    }
    store.setResume(null);
    setDone({ before, ms });
    window.scrollTo({ top: 0 });
  }, [done, bank, test, ids, picks, setup, kind, params, store]);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !done) finish();
  }, [remaining, done, finish]);

  const choose = useCallback(
    (c: number) => {
      if (done) return;
      if (test) {
        setPicks((p) => p.map((x, i) => (i === idx ? c : x)));
        return;
      }
      if (picks[idx] !== null) return;
      bank();
      setPicks((p) => p.map((x, i) => (i === idx ? c : x)));
      store.recordAnswers([{ q, pick: c, ms: times.current[idx] }], kind);
    },
    [done, test, idx, picks, bank, q, store, kind],
  );

  const go = useCallback(
    (to: number) => {
      bank();
      if (kind === "endless" && to >= ids.length) {
        const used = new Set(ids);
        const next = nextEndless(setup.pool, store.logs.answers, used);
        if (!next) {
          finish();
          return;
        }
        setIds((x) => [...x, next.id]);
        setPicks((p) => [...p, null]);
        times.current.push(0);
      }
      setIdx(
        Math.max(
          0,
          Math.min(to, kind === "endless" ? ids.length : ids.length - 1),
        ),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [bank, kind, ids, setup.pool, store.logs.answers, finish],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        done ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement)?.closest("input,textarea,select")
      )
        return;
      const k = e.key.toUpperCase();
      const n = "ABCD".indexOf(k) >= 0 ? "ABCD".indexOf(k) : "1234".indexOf(k);
      if (n >= 0 && n < q.choices.length) {
        e.preventDefault();
        choose(n);
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        if (test ? idx < ids.length - 1 : revealed) {
          e.preventDefault();
          if (!test && idx === ids.length - 1 && kind !== "endless") finish();
          else go(idx + 1);
        }
      } else if (e.key === "ArrowLeft" && test && idx > 0) {
        e.preventDefault();
        go(idx - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, q, choose, test, idx, ids.length, revealed, go, finish, kind]);

  if (done)
    return (
      <Results
        params={params}
        kind={kind}
        setup={setup}
        ids={ids}
        picks={picks}
        times={times.current}
        ms={done.ms}
        before={done.before}
      />
    );

  const answered = picks.filter((p) => p !== null).length;
  const sessionRight = ids.filter(
    (id, i) => picks[i] !== null && picks[i] === setup.qs.get(id)!.answer,
  ).length;
  const last = idx === ids.length - 1;
  const topicName = store.topicBy(q.topic)?.name;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-52 pt-4 md:px-8 md:pb-16 md:pt-8">
      <div className="sticky top-14 z-10 -mx-4 border-b border-rule bg-ground/95 px-4 py-3 backdrop-blur md:top-0 md:-mx-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{setup.label}</div>
            <div className="num text-sm text-ink-2">
              {kind === "endless"
                ? `${answered} answered · ${sessionRight} right`
                : `Question ${idx + 1} of ${ids.length}`}
              {!test &&
                kind !== "endless" &&
                answered > 0 &&
                ` · ${sessionRight}/${answered} right`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {remaining !== null && (
              <span
                className={
                  "display num px-2 text-2xl " +
                  (remaining < 60000 ? "text-danger" : "")
                }
                aria-label="Time left"
              >
                {clock(remaining)}
              </span>
            )}
            <button
              className="btn min-h-10 px-3 text-sm"
              onClick={() => {
                bank();
                nav("/play");
              }}
            >
              {kind === "duel" ? "Leave" : "Save & quit"}
            </button>
          </div>
        </div>
        {kind !== "endless" && (
          <div className="bar mt-3" aria-hidden>
            <span
              style={{
                width: `${((test ? answered : idx + (revealed ? 1 : 0)) / ids.length) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      <article className="pt-6" aria-live="polite">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          {setup.qs.size > 100 && topicName && (
            <span className="font-semibold text-ink">{topicName}</span>
          )}
          <span>{q.sub}</span>
          <span
            aria-label={`Difficulty ${q.diff} of 3`}
            className="inline-flex gap-0.5"
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={
                  "inline-block h-2 w-2 " +
                  (n <= q.diff ? "bg-ink-2" : "bg-rule")
                }
              />
            ))}
          </span>
        </div>
        <h1 className="text-xl font-semibold leading-snug md:text-2xl">
          {q.q}
        </h1>

        <ol className="mt-6 space-y-2">
          {q.choices.map((c, i) => {
            const picked = picks[idx] === i;
            const right = i === q.answer;
            let tone = "border-rule-strong hover:border-ink hover:bg-band";
            if (test && picked) tone = "border-field bg-field text-on-field";
            if (revealed && right) tone = "border-ok bg-ok-band";
            if (revealed && picked && !right)
              tone = "border-danger bg-danger-band";
            if (revealed && !picked && !right) tone = "border-rule opacity-60";
            return (
              <li key={i}>
                <button
                  className={
                    "flex min-h-14 w-full items-start gap-3 border px-3 py-3 text-left transition-colors " +
                    tone
                  }
                  onClick={() => choose(i)}
                  aria-pressed={picked}
                  disabled={revealed}
                >
                  <span
                    className={
                      "display inline-flex h-8 w-8 shrink-0 items-center justify-center border text-lg " +
                      (test && picked ? "border-on-field" : "border-current")
                    }
                  >
                    {LETTERS[i]}
                  </span>
                  <span className="pt-1">{c}</span>
                  {revealed && right && (
                    <Check
                      className="ml-auto mt-1 shrink-0 text-ok"
                      size={20}
                      aria-label="Correct answer"
                    />
                  )}
                  {revealed && picked && !right && (
                    <X
                      className="ml-auto mt-1 shrink-0 text-danger"
                      size={20}
                      aria-label="Your answer"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {revealed && (
          <div
            className={
              "mt-4 border px-4 py-3 " +
              (picks[idx] === q.answer
                ? "border-ok bg-ok-band"
                : "border-danger bg-danger-band")
            }
          >
            <p className="font-semibold">
              {picks[idx] === q.answer
                ? "Right."
                : `Not quite. It's ${LETTERS[q.answer]}.`}
            </p>
            <p className="mt-1">{q.explain}</p>
          </div>
        )}
      </article>

      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-rule bg-ground px-4 py-3 md:static md:mt-8 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          {test ? (
            <>
              <button
                className="btn"
                onClick={() => go(idx - 1)}
                disabled={idx === 0}
              >
                <ChevronLeft size={18} /> Back
              </button>
              <button
                className="btn hidden sm:inline-flex"
                onClick={() => setShowGrid((s) => !s)}
                aria-expanded={showGrid}
              >
                {answered}/{ids.length} answered
              </button>
              {last ? (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    answered < ids.length ? setConfirmSubmit(true) : finish()
                  }
                >
                  <Flag size={18} /> Submit
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => go(idx + 1)}>
                  Next <ChevronRight size={18} />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                className="btn"
                onClick={finish}
                disabled={answered === 0}
              >
                {kind === "endless" ? "Stop here" : "End early"}
              </button>
              <button
                className="btn btn-primary"
                disabled={!revealed}
                onClick={() =>
                  last && kind !== "endless" ? finish() : go(idx + 1)
                }
              >
                {last && kind !== "endless" ? "See results" : "Next"}{" "}
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {test && (
        <div className="mt-8">
          <button
            className="label underline sm:hidden"
            onClick={() => setShowGrid((s) => !s)}
            aria-expanded={showGrid}
          >
            All questions ({answered}/{ids.length})
          </button>
          {(showGrid || ids.length <= 50) && (
            <ol
              className="mt-3 grid grid-cols-10 gap-1"
              aria-label="Jump to question"
            >
              {ids.map((_, i) => (
                <li key={i}>
                  <button
                    className={
                      "num h-9 w-full border text-sm " +
                      (i === idx ? "border-ink font-bold " : "border-rule ") +
                      (picks[i] !== null
                        ? "bg-field text-on-field"
                        : "hover:bg-band")
                    }
                    onClick={() => go(i)}
                    aria-label={`Question ${i + 1}${picks[i] !== null ? ", answered" : ""}`}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {confirmSubmit && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-h"
        >
          <div className="w-full max-w-sm border border-rule bg-ground p-5">
            <h2 id="sub-h" className="display text-2xl">
              Submit with {ids.length - answered} blank?
            </h2>
            <p className="mt-2 text-ink-2">
              Blanks count as wrong, same as at competition.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn"
                onClick={() => setConfirmSubmit(false)}
                autoFocus
              >
                Keep going
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmSubmit(false);
                  finish();
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({
  params,
  kind,
  setup,
  ids,
  picks,
  times,
  ms,
  before,
}: {
  params: URLSearchParams;
  kind: Kind;
  setup: Setup;
  ids: string[];
  picks: (number | null)[];
  times: number[];
  ms: number;
  before: number;
}) {
  const store = useStore();
  const [onlyMisses, setOnlyMisses] = useState(false);
  const rows = ids
    .map((id, i) => ({
      q: setup.qs.get(id)!,
      pick: picks[i],
      ms: times[i] ?? 0,
    }))
    .filter((r) => kind !== "endless" || r.pick !== null);
  const total = TESTS.has(kind)
    ? rows.length
    : rows.filter((r) => r.pick !== null).length;
  const right = rows.filter((r) => r.pick === r.q.answer).length;
  const after = store.d.rating;
  const bySub = new Map<string, { n: number; r: number }>();
  rows.forEach((r) => {
    const s = bySub.get(r.q.sub) ?? { n: 0, r: 0 };
    s.n++;
    if (r.pick === r.q.answer) s.r++;
    bySub.set(r.q.sub, s);
  });
  const list = onlyMisses ? rows.filter((r) => r.pick !== r.q.answer) : rows;
  const again = new URLSearchParams(params);
  again.delete("resume");

  return (
    <Page
      title={total ? `${right} / ${total}` : "Session ended"}
      sub={setup.label}
    >
      <div className="grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4">
        <Cell label="Score" value={total ? pct(right / total) : "—"} />
        <Cell
          label="Time"
          value={secs(ms)}
          sub={
            total ? `${secs(ms / Math.max(1, total))} a question` : undefined
          }
        />
        <Cell
          label="Rating"
          value={int(after)}
          sub={`${signed(Math.round(after - before))} this session`}
        />
        <Cell
          label="Mastered"
          value={int(store.d.mastery.mastered)}
          sub={`of ${int(store.totalQuestions)}`}
        />
      </div>

      {bySub.size > 1 && (
        <section className="mt-8">
          <h2 className="display mb-3 text-2xl">By area</h2>
          <ul className="border-t border-rule">
            {[...bySub]
              .sort((a, b) => a[1].r / a[1].n - b[1].r / b[1].n)
              .map(([sub, s]) => (
                <li
                  key={sub}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-rule py-2"
                >
                  <span>{sub}</span>
                  <span className="num text-right font-semibold">
                    {s.r}/{s.n}
                  </span>
                  <div className="col-span-2">
                    <div className="bar">
                      <span style={{ width: `${(s.r / s.n) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link className="btn btn-primary" to="/play">
          Back to Play
        </Link>
        {kind !== "duel" && (
          <Link
            className="btn"
            to={`/play/run?${again.toString()}`}
            reloadDocument
          >
            Go again
          </Link>
        )}
        {rows.some((r) => r.pick !== r.q.answer) && (
          <Link className="btn" to="/play/run?kind=fix" reloadDocument>
            Fix the misses
          </Link>
        )}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-2xl">Review</h2>
          <button
            className="chip"
            aria-pressed={onlyMisses}
            onClick={() => setOnlyMisses((v) => !v)}
          >
            Only misses
          </button>
        </div>
        <ol className="space-y-4">
          {list.map((r) => {
            const ok = r.pick === r.q.answer;
            return (
              <li key={r.q.id} className="panel p-4">
                <div className="flex items-start gap-3">
                  {ok ? (
                    <Check
                      className="mt-1 shrink-0 text-ok"
                      size={20}
                      aria-label="Right"
                    />
                  ) : (
                    <X
                      className="mt-1 shrink-0 text-danger"
                      size={20}
                      aria-label="Wrong"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{r.q.q}</p>
                    <p className="mt-2 text-sm">
                      {r.pick === null ? (
                        <span className="text-ink-2">Left blank. </span>
                      ) : (
                        !ok && (
                          <span className="text-danger">
                            You said {LETTERS[r.pick]}: {r.q.choices[r.pick]}
                            .{" "}
                          </span>
                        )
                      )}
                      <span className="font-semibold">
                        {LETTERS[r.q.answer]}: {r.q.choices[r.q.answer]}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-ink-2">{r.q.explain}</p>
                  </div>
                </div>
              </li>
            );
          })}
          {!list.length && (
            <li className="text-ink-2">No misses. Clean sheet.</li>
          )}
        </ol>
      </section>
    </Page>
  );
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card p-4">
      <div className="label">{label}</div>
      <div className="display num mt-1 text-3xl">{value}</div>
      {sub && <div className="text-sm text-ink-2">{sub}</div>}
    </div>
  );
}
