import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useStore } from "../state";
import { GROUPS } from "../lib/content";
import {
  buildDeck,
  dayKey,
  daySummary,
  DECK_FILTERS,
  NEW_TARGET,
  states,
  type DeckFilter,
  type Term,
} from "../lib/srs";
import { Avatar, Bar, Page, int, pct } from "../components/ui";
import type { Logs } from "../lib/backend";

export const ROUNDS = [10, 20, 50] as const;
const PREF = "kcbfbla:vocab";
type Prefs = { deck: DeckFilter; topics: string[]; round: number };
export const readPrefs = (): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || "null");
    if (p)
      return {
        deck: p.deck ?? "smart",
        topics: p.topics ?? [],
        round: p.round ?? 20,
      };
  } catch {
    /* ignore */
  }
  return { deck: "smart", topics: [], round: 20 };
};

// every term the member can study: the event banks plus their own words
export function useTerms(): Term[] {
  const { vocab, words } = useStore();
  return useMemo(
    () => [
      ...vocab,
      ...words.map((w) => ({
        id: "w:" + w.id,
        term: w.term,
        def: w.def,
        topic: "mine",
        mine: true,
      })),
    ],
    [vocab, words],
  );
}

export function VocabTabs() {
  return (
    <nav className="mb-6 flex gap-2" aria-label="Vocab">
      <NavLink end to="/vocab" className="chip min-h-11 px-5 text-base">Cards</NavLink>
      <NavLink to="/vocab/words" className="chip min-h-11 px-5 text-base">My Words</NavLink>
    </nav>
  );
}

function vocabStats(terms: Term[], logs: Logs | null, today: string) {
  if (!logs) return null;
  const st = states(logs.reviews);
  let mastered = 0,
    seen = 0,
    due = 0;
  for (const t of terms) {
    const s = st.get(t.id);
    if (!s) continue;
    seen++;
    if (s.mastered) mastered++;
    if (s.due <= today) due++;
  }
  return { mastered, seen, due };
}

export default function Vocab() {
  const store = useStore();
  const { me, logs, d, topics, rivalOf, loadUser } = store;
  const nav = useNavigate();
  const terms = useTerms();
  const today = dayKey(new Date());
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const rival = rivalOf(me);
  const [rivalLogs, setRivalLogs] = useState<Logs | null>(null);
  useEffect(() => {
    if (rival)
      loadUser(rival.id)
        .then((u) => setRivalLogs(u?.logs ?? null))
        .catch(() => 0);
  }, [rival?.id, loadUser]);

  const bank = terms.filter((t) => !t.mine);
  const mine = vocabStats(bank, logs, today)!;
  const theirs = vocabStats(bank, rivalLogs, today);
  const sum = daySummary(logs.reviews, today);
  const st = d.srs;
  const deckOpts = { today, newTarget: NEW_TARGET, newDoneToday: sum.newDone };
  const deck = useMemo(
    () =>
      buildDeck(terms, st, {
        ...deckOpts,
        filter: prefs.deck,
        topics: prefs.topics,
      }),
    [terms, st, prefs, sum.newDone, today],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        DECK_FILTERS.map((f) => [
          f.id,
          buildDeck(terms, st, {
            ...deckOpts,
            filter: f.id,
            topics: prefs.topics,
          }).length,
        ]),
      ),
    [terms, st, prefs.topics, sum.newDone, today],
  );
  const introduced = bank.filter((t) => st.has(t.id)).length;
  const dueToday = bank.filter((t) => {
    const s = st.get(t.id);
    return s && s.due <= today;
  }).length;
  const newLeft = Math.max(0, NEW_TARGET - sum.newDone);
  const n = Math.min(prefs.round, deck.length);
  const lastAt = logs.reviews.length
    ? logs.reviews[logs.reviews.length - 1].at
    : null;
  const preview = deck[0] ?? bank[0];
  const start = (mode: "flip" | "match") =>
    nav(
      `/vocab/study?mode=${mode}&deck=${prefs.deck}&topics=${prefs.topics.join(",")}&n=${prefs.round}`,
    );
  const toggleTopic = (slug: string) =>
    setPrefs((p) => ({
      ...p,
      topics: p.topics.includes(slug)
        ? p.topics.filter((x) => x !== slug)
        : [...p.topics, slug],
    }));
  const byTopic = useMemo(() => {
    const m = new Map<string, number>();
    terms.forEach((t) => m.set(t.topic, (m.get(t.topic) ?? 0) + 1));
    return m;
  }, [terms]);

  return (
    <Page
      title="Vocab"
      sub={
        <>
          <b className="num text-ink">{int(bank.length)}</b> terms in the
          collection across {topics.length} events
          {terms.length > bank.length
            ? `, plus ${terms.length - bank.length} of your own`
            : ""}
          .
        </>
      }
    >
      <VocabTabs />

      <section className="panel" aria-label="Vocabulary progress">
        <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-end gap-x-2 border-b border-rule px-4 py-2 md:grid-cols-[1fr_repeat(3,6rem)]">
          <span className="label">Member</span>
          <span className="label text-right">Mastered</span>
          <span className="label text-right">Seen</span>
          <span className="label text-right">Due</span>
        </div>
        <VocabRow name={me?.name ?? "You"} you s={mine} total={bank.length} />
        {rival ? (
          <VocabRow name={rival.name} s={theirs} total={bank.length} />
        ) : (
          <p className="px-4 py-3 text-sm text-ink-2">
            Pick a rival in Settings to compare vocab.
          </p>
        )}
      </section>

      <section className="panel mt-4 p-4 md:p-5" aria-labelledby="today-h">
        <h2 id="today-h" className="display text-2xl">
          Today
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-px border border-rule bg-rule">
          {[
            ["Reviews due", dueToday],
            ["New left", newLeft],
            ["New done", sum.newDone],
          ].map(([l, v]) => (
            <div key={l} className="bg-card p-3">
              <div className="label">{l}</div>
              <div className="display num text-3xl">{int(v as number)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Bar
            value={bank.length ? introduced / bank.length : 0}
            label="Share of the collection introduced"
          />
        </div>
        <p className="mt-2 text-sm text-ink-2">
          <span className="num">{int(introduced)}</span> introduced ·{" "}
          <span className="num">
            {pct(bank.length ? introduced / bank.length : 0)}
          </span>{" "}
          of the collection · target {NEW_TARGET} new a day ·{" "}
          {lastAt ? (
            <>
              last studied {ago(lastAt)}, {sum.reviewedToday} reviews today (
              {sum.rightToday} right)
            </>
          ) : (
            "no reviews yet"
          )}
        </p>
      </section>

      <section
        className="mt-8 grid gap-4 md:grid-cols-2"
        aria-label="Study modes"
      >
        <button
          className="panel group flex flex-col justify-start p-5 text-left transition-colors hover:border-ink hover:bg-band disabled:opacity-50"
          onClick={() => start("flip")}
          disabled={!deck.length}
        >
          <div className="flex items-center justify-between">
            <h3 className="display text-3xl">Flip</h3>
            <span className="label">Recall, then reveal</span>
          </div>
          <div className="mt-4 flex h-32 items-center justify-center border border-rule-strong bg-ground px-4 text-center">
            <span className="display text-2xl">{preview?.term ?? "Term"}</span>
          </div>
          <p className="mt-3 text-ink-2">
            See the term, say the definition in your head, then flip to check
            yourself.
          </p>
        </button>
        <button
          className="panel group flex flex-col justify-start p-5 text-left transition-colors hover:border-ink hover:bg-band disabled:opacity-50"
          onClick={() => start("match")}
          disabled={!deck.length}
        >
          <div className="flex items-center justify-between">
            <h3 className="display text-3xl">Match</h3>
            <span className="label">Definition to term</span>
          </div>
          <div className="mt-4 grid h-32 grid-rows-[1fr_auto] gap-2">
            <div className="flex items-center border border-rule-strong bg-ground px-3 text-sm text-ink-2">
              <span className="line-clamp-3">
                {preview?.def ?? "Definition"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-7 border border-dashed border-rule-strong"
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-ink-2">
            Read the definition and pick the right term from four.
          </p>
        </button>
      </section>

      <section className="mt-8" aria-labelledby="deck-h">
        <h2 id="deck-h" className="label mb-2">
          Deck
        </h2>
        <div className="flex flex-wrap gap-2">
          {DECK_FILTERS.map((f) => (
            <button
              key={f.id}
              className="chip"
              aria-pressed={prefs.deck === f.id}
              title={f.hint}
              onClick={() => setPrefs((p) => ({ ...p, deck: f.id }))}
            >
              {f.label} <span className="count num">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="topic-h">
        <h2 id="topic-h" className="label mb-2">
          Topic
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="chip"
            aria-pressed={prefs.topics.length === 0}
            onClick={() => setPrefs((p) => ({ ...p, topics: [] }))}
          >
            All <span className="count num">{terms.length}</span>
          </button>
        </div>
        {GROUPS.map((g) => (
          <div key={g.id} className="mt-3">
            <div className="mb-1 text-sm font-semibold text-ink-2">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {topics
                .filter((t) => t.group === g.id)
                .map((t) => (
                  <button
                    key={t.slug}
                    className="chip"
                    aria-pressed={prefs.topics.includes(t.slug)}
                    onClick={() => toggleTopic(t.slug)}
                  >
                    {t.name}{" "}
                    <span className="count num">
                      {byTopic.get(t.slug) ?? 0}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {(byTopic.get("mine") ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="chip"
              aria-pressed={prefs.topics.includes("mine")}
              onClick={() => toggleTopic("mine")}
            >
              My Words <span className="count num">{byTopic.get("mine")}</span>
            </button>
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="round-h">
        <h2 id="round-h" className="label mb-2">
          Round
        </h2>
        <div className="flex gap-2">
          {ROUNDS.map((r) => (
            <button
              key={r}
              className="chip min-w-14 justify-center"
              aria-pressed={prefs.round === r}
              onClick={() => setPrefs((p) => ({ ...p, round: r }))}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-rule pt-6">
        <button
          className="btn btn-primary min-h-14 px-8 text-lg"
          disabled={!n}
          onClick={() => start("match")}
        >
          Match {n} {n === 1 ? "Card" : "Cards"}
        </button>
        <span className="text-ink-2">
          <b className="num text-ink">{int(deck.length)}</b>{" "}
          {deck.length === 1 ? "term" : "terms"} in this deck
        </span>
        {!deck.length && (
          <span className="text-sm text-ink-2">
            Nothing here right now. Try Smart or Everything, or another topic.
          </span>
        )}
      </div>
      <p className="mt-6 text-xs text-ink-2">
        Vocab is written for this site from FBLA's published competency areas;
        definitions are study aids, not official FBLA text.{" "}
        <Link className="underline" to="/vocab/words">
          Add your own words.
        </Link>
      </p>
    </Page>
  );
}

function VocabRow({
  name,
  s,
  total,
  you,
}: {
  name: string;
  s: { mastered: number; seen: number; due: number } | null;
  total: number;
  you?: boolean;
}) {
  return (
    <div
      className={
        "border-b border-rule px-4 py-3 last:border-b-0 " +
        (you ? "bg-band" : "")
      }
    >
      <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 md:grid-cols-[1fr_repeat(3,6rem)]">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={name} size={28} you={you} />
          <span className="truncate font-semibold">{name}</span>
          {you && (
            <span className="bg-gold px-1.5 text-xs font-bold text-on-gold">
              YOU
            </span>
          )}
        </span>
        {s ? (
          <>
            <span className="display num text-right text-2xl">
              {int(s.mastered)}
            </span>
            <span className="num text-right">{int(s.seen)}</span>
            <span className="num text-right">{int(s.due)}</span>
          </>
        ) : (
          <span className="col-span-3 text-right text-sm text-ink-2">
            Loading…
          </span>
        )}
      </div>
      {s && (
        <div className="mt-2">
          <Bar
            value={total ? s.mastered / total : 0}
            label={`${name}: share of terms mastered`}
            tone={you ? "gold" : undefined}
          />
        </div>
      )}
    </div>
  );
}

export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
