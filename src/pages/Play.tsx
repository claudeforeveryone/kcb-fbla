import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Infinity as InfinityIcon,
  Target,
  FileText,
  Dumbbell,
  Swords,
} from "lucide-react";
import { useStore } from "../state";
import { GROUPS, PAPERS, type Topic } from "../lib/content";
import { weakReport } from "../lib/pick";
import { Page, pct } from "../components/ui";

export default function Play() {
  const { me, topics, logs, setResume, saveProfile, profiles, topicBy, d } =
    useStore();
  const nav = useNavigate();
  const [event, setEvent] = useState<string>(
    me?.event ?? topics[0]?.slug ?? "accounting",
  );
  const [sub, setSub] = useState("");
  const t = topicBy(event);
  const report = useMemo(
    () => weakReport(logs.answers, event),
    [logs.answers, event],
  );
  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of logs.papers)
      m.set(p.label, Math.max(m.get(p.label) ?? 0, p.correct / p.total));
    return m;
  }, [logs.papers]);
  const r = me?.resume;
  const incoming = logs.duels.filter(
    (x) => x.opponent === me?.id && x.o_score === null,
  );
  const waiting = logs.duels.filter(
    (x) => x.challenger === me?.id && x.c_score !== null && x.o_score === null,
  );
  const toPlay = logs.duels.filter(
    (x) => x.challenger === me?.id && x.c_score === null,
  );
  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.name ?? "A member";
  const go = (q: Record<string, string>) =>
    nav("/play/run?" + new URLSearchParams(q).toString());
  const pickEvent = (slug: string) => {
    setEvent(slug);
    setSub("");
    if (me && !me.event) saveProfile({ event: slug }).catch(() => 0);
  };

  return (
    <Page title="Play">
      <section
        aria-labelledby="keep-h"
        className="bg-field text-on-field mb-10 p-5 md:p-7"
      >
        <h2 id="keep-h" className="display text-4xl md:text-5xl">
          Keep going
        </h2>
        {r ? (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{r.label}</p>
              <p className="num text-on-field-2">
                {r.kind === "endless"
                  ? `${r.picks.filter((p) => p !== null).length} answered so far`
                  : `${r.picks.filter((p) => p !== null).length} of ${r.ids.length} answered`}
              </p>
              {r.kind !== "endless" && (
                <div
                  className="bar mt-3 max-w-md"
                  style={{ background: "var(--field-2)" }}
                >
                  <span
                    style={{
                      width: `${(r.picks.filter((p) => p !== null).length / r.ids.length) * 100}%`,
                      background: "var(--gold)",
                    }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-sm text-on-field-2 underline hover:text-on-field"
                onClick={() => setResume(null)}
              >
                Discard
              </button>
              <Link to="/play/run?resume=1" className="btn btn-gold">
                Continue <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-md text-on-field-2">
              Nothing in progress.{" "}
              {t ? (
                <>
                  Your next step:{" "}
                  <b className="text-on-field">{t.name} Paper A</b>, 50
                  questions in 25 minutes.
                </>
              ) : (
                "Pick an event below."
              )}
            </p>
            {t && (
              <button
                className="btn btn-gold"
                onClick={() => go({ kind: "paper", topic: t.slug, paper: "A" })}
              >
                Start Paper A <ArrowRight size={18} />
              </button>
            )}
          </div>
        )}
      </section>

      {(incoming.length > 0 || waiting.length > 0 || toPlay.length > 0) && (
        <section className="mb-10" aria-labelledby="duel-h">
          <h2 id="duel-h" className="display mb-3 text-3xl">
            1v1
          </h2>
          <ul className="border-t border-rule">
            {incoming.map((x) => (
              <li
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3"
              >
                <span>
                  <b>{nameOf(x.challenger)}</b> challenged you ·{" "}
                  {topicBy(x.topic)?.name} · {x.size} questions
                </span>
                <button
                  className="btn btn-primary"
                  onClick={() => go({ kind: "duel", id: x.id })}
                >
                  Play it
                </button>
              </li>
            ))}
            {toPlay.map((x) => (
              <li
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3"
              >
                <span>
                  Your challenge to <b>{nameOf(x.opponent)}</b> · play your side
                  first
                </span>
                <button
                  className="btn"
                  onClick={() => go({ kind: "duel", id: x.id })}
                >
                  Play
                </button>
              </li>
            ))}
            {waiting.map((x) => (
              <li key={x.id} className="border-b border-rule py-3 text-ink-2">
                Waiting on <b className="text-ink">{nameOf(x.opponent)}</b> ·
                you scored {x.c_score}/{x.size}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="prep-h" className="mb-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3">
          <div>
            <h2 id="prep-h" className="display text-3xl">
              Exam prep
            </h2>
            <p className="text-ink-2">
              Pick your event, then pick how to train.
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="label">Event</span>
            <select
              className="field-input w-auto min-w-56"
              value={event}
              onChange={(e) => pickEvent(e.target.value)}
            >
              {GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {topics
                    .filter((x) => x.group === g.id)
                    .map((x) => (
                      <option key={x.slug} value={x.slug}>
                        {x.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-px border border-rule bg-rule md:grid-cols-2">
          <Mode
            icon={Dumbbell}
            title="Practice"
            line="20 questions with answers and explanations as you go. Unseen first."
          >
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                className="field-input w-auto max-w-full flex-1 text-sm"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                aria-label="Competency area"
              >
                <option value="">All areas</option>
                {t?.subs.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.count})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={() =>
                  go({
                    kind: "practice",
                    topic: event,
                    ...(sub ? { sub } : {}),
                  })
                }
              >
                Practice
              </button>
            </div>
          </Mode>
          <Mode
            icon={Target}
            title="Weak spots"
            line={
              report.misses.length
                ? `${report.misses.filter((m) => m.lastWrong).length} open misses here. Your worst areas:`
                : "Your most-missed questions and areas collect here as you play."
            }
          >
            {report.areas.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {report.areas.slice(0, 3).map((a) => (
                  <li key={a.sub} className="flex justify-between gap-3">
                    <span className="truncate">{a.sub}</span>
                    <span className="num shrink-0 text-danger">
                      {pct(a.rate)} missed
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="btn btn-primary mt-3"
              disabled={!report.misses.length}
              onClick={() => go({ kind: "weak", topic: event })}
            >
              Drill weak spots
            </button>
          </Mode>
          <Mode
            icon={FileText}
            title="Mock exam"
            line="100 questions, 50 minutes, no answers until you submit. The real format."
          >
            <button
              className="btn btn-primary mt-3"
              onClick={() => go({ kind: "mock", topic: event })}
            >
              Start mock
            </button>
          </Mode>
          <Mode
            icon={InfinityIcon}
            title="Endless"
            line="Questions until you stop. Leans toward ones you haven't mastered."
          >
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                onClick={() => go({ kind: "endless", topic: event })}
              >
                {t?.short ?? "Event"} only
              </button>
              <button
                className="btn"
                onClick={() => go({ kind: "endless", topic: "all" })}
              >
                All events
              </button>
            </div>
          </Mode>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
          <span>
            Open misses across every event:{" "}
            <b className="num text-ink">{d.mastery.openMisses.length}</b>
          </span>
          <span className="flex gap-4">
            {d.mastery.openMisses.length > 0 && (
              <Link className="link" to="/play/run?kind=fix">
                Fix them
              </Link>
            )}
            <Link className="link inline-flex items-center gap-1" to="/duel">
              <Swords size={15} aria-hidden /> Challenge someone
            </Link>
          </span>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="mb-12">
          <div className="mb-2 border-b border-rule pb-3">
            <h2 id={`g-${g.id}`} className="display text-3xl">
              {g.label}
            </h2>
            <p className="text-ink-2">{g.blurb}</p>
          </div>
          <ul>
            {topics
              .filter((x) => x.group === g.id)
              .map((x) => (
                <EventRow
                  key={x.slug}
                  t={x}
                  best={best}
                  you={me?.event === x.slug}
                />
              ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

function Mode({
  icon: Icon,
  title,
  line,
  children,
}: {
  icon: typeof Target;
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon size={20} aria-hidden className="text-gold-ink" />
        <h3 className="display text-2xl">{title}</h3>
      </div>
      <p className="mt-1 text-ink-2">{line}</p>
      {children}
    </div>
  );
}

function EventRow({
  t,
  best,
  you,
}: {
  t: Topic;
  best: Map<string, number>;
  you: boolean;
}) {
  const nav = useNavigate();
  return (
    <li className="grid gap-3 border-b border-rule py-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="display text-2xl">{t.name}</span>
          <span className="label">{t.short}</span>
          {you && (
            <span className="bg-gold px-1.5 text-xs font-bold text-on-gold">
              YOUR EVENT
            </span>
          )}
        </div>
        <div className="text-sm text-ink-2">
          {t.questions} questions · {t.subs.length} areas
          {t.gradeNote ? ` · ${t.gradeNote}` : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {PAPERS.map((p) => {
          const b = best.get(`${t.name} · ${p.label}`);
          return (
            <button
              key={p.id}
              className="chip min-h-11"
              onClick={() =>
                nav(`/play/run?kind=paper&topic=${t.slug}&paper=${p.id}`)
              }
            >
              {p.label}{" "}
              <span className="count num">
                {b != null ? `best ${pct(b)}` : `${p.size}q · ${p.minutes}m`}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

