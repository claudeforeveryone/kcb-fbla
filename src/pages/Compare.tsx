import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore, derive } from "../state";
import { readiness } from "../lib/score";
import { duelResult } from "../lib/stats";
import { Avatar, Empty, Loading, Page, dur, int, pct } from "../components/ui";
import type { Logs, Profile } from "../lib/backend";

type Row = {
  label: string;
  a: number | null;
  b: number | null;
  fmt: (n: number | null) => string;
  low?: boolean;
};

export default function Compare() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me, logs, d, profiles, rivalOf, loadUser, topicBy } = useStore();
  const target = id ?? rivalOf(me)?.id;
  const [other, setOther] = useState<
    { profile: Profile; logs: Logs } | null | undefined
  >(undefined);
  useEffect(() => {
    if (!target) {
      setOther(null);
      return;
    }
    setOther(undefined);
    loadUser(target)
      .then((u) => setOther(u ?? null))
      .catch(() => setOther(null));
  }, [target, loadUser]);
  const od = useMemo(
    () => (other ? derive(other.logs, other.profile.id) : null),
    [other],
  );

  if (!me) return null;
  const picker = (
    <select
      className="field-input w-auto"
      value={target ?? ""}
      onChange={(e) => nav(`/compare/${e.target.value}`)}
      aria-label="Compare with"
    >
      <option value="" disabled>
        Pick a member
      </option>
      {profiles
        .filter((p) => p.id !== me.id)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
  if (!target)
    return (
      <Page title="Compare">
        <Empty title="No one to compare with yet">
          Once other members join, pick one here.
        </Empty>
      </Page>
    );
  if (other === undefined) return <Loading />;
  if (!other || !od)
    return (
      <Page title="Compare" actions={picker}>
        <Empty title="Member not found" />
      </Page>
    );

  const ready = (l: Logs, ev: string | null) => {
    const t = topicBy(ev);
    if (!t) return null;
    const r = readiness(l.answers, t.slug, t.subs);
    return r.ready ? r.score : null;
  };
  const h2h = logs.duels
    .filter(
      (x) =>
        x.challenger === other.profile.id || x.opponent === other.profile.id,
    )
    .map((x) => duelResult(x, me.id));
  const n = (x: number) => int(x);
  const p = (x: number | null) => pct(x);
  const rows: Row[] = [
    {
      label: "Rating",
      a: d.rating,
      b: od.rating,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Peak rating",
      a: d.peak,
      b: od.peak,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Mastered",
      a: d.mastery.mastered,
      b: od.mastery.mastered,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Answered",
      a: d.summary.answered,
      b: od.summary.answered,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Accuracy",
      a: d.summary.accuracy,
      b: od.summary.accuracy,
      fmt: p,
    },
    {
      label: "First-try accuracy",
      a: d.summary.firstAccuracy,
      b: od.summary.firstAccuracy,
      fmt: p,
    },
    {
      label: "Readiness (own event)",
      a: ready(logs, me.event),
      b: ready(other.logs, other.profile.event),
      fmt: (x) => (x == null ? "—" : `${x}`),
    },
    {
      label: "Open misses",
      a: d.mastery.openMisses.length,
      b: od.mastery.openMisses.length,
      fmt: (x) => (x == null ? "—" : n(x)),
      low: true,
    },
    {
      label: "Best streak",
      a: d.summary.bestStreak,
      b: od.summary.bestStreak,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Day streak",
      a: d.summary.dayStreak,
      b: od.summary.dayStreak,
      fmt: (x) => (x == null ? "—" : n(x)),
    },
    {
      label: "Time studied",
      a: d.summary.timeMs,
      b: od.summary.timeMs,
      fmt: (x) => (x == null ? "—" : dur(x)),
    },
    {
      label: "Best paper",
      a: d.summary.bestPaper,
      b: od.summary.bestPaper,
      fmt: p,
    },
  ];
  const lead = rows.filter(
    (r) => r.a != null && r.b != null && (r.low ? r.a < r.b : r.a > r.b),
  ).length;
  const trail = rows.filter(
    (r) => r.a != null && r.b != null && (r.low ? r.a > r.b : r.a < r.b),
  ).length;

  return (
    <Page
      title="Compare"
      sub={`You lead on ${lead}, trail on ${trail}.`}
      actions={picker}
    >
      <div className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2 border-b border-rule pb-3 md:grid-cols-[1fr_10rem_10rem]">
        <span />
        <span className="flex flex-col items-end gap-1 text-right">
          <Avatar name={me.name} you />
          <b className="truncate">You</b>
        </span>
        <span className="flex flex-col items-end gap-1 text-right">
          <Avatar name={other.profile.name} />
          <Link className="link truncate" to={`/u/${other.profile.id}`}>
            {other.profile.name}
          </Link>
        </span>
      </div>
      <ul>
        {rows.map((r) => {
          const aWins =
            r.a != null && r.b != null && (r.low ? r.a < r.b : r.a > r.b);
          const bWins =
            r.a != null && r.b != null && (r.low ? r.a > r.b : r.a < r.b);
          return (
            <li
              key={r.label}
              className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 border-b border-rule py-2 md:grid-cols-[1fr_10rem_10rem]"
            >
              <span className="text-ink-2">{r.label}</span>
              <span
                className={
                  "num text-right text-lg " + (aWins ? "font-bold" : "")
                }
              >
                {aWins && (
                  <span
                    className="mr-1 inline-block h-2 w-2 bg-gold align-middle"
                    aria-label="leads"
                  />
                )}
                {r.fmt(r.a)}
              </span>
              <span
                className={
                  "num text-right text-lg " + (bWins ? "font-bold" : "")
                }
              >
                {bWins && (
                  <span
                    className="mr-1 inline-block h-2 w-2 bg-field align-middle dark:bg-on-field"
                    aria-label="leads"
                  />
                )}
                {r.fmt(r.b)}
              </span>
            </li>
          );
        })}
        <li className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-rule py-2">
          <span className="text-ink-2">1v1 head to head</span>
          <span className="num text-right text-lg">
            {h2h.filter((x) => x === "win").length}–
            {h2h.filter((x) => x === "loss").length}
            {h2h.includes("pending") ? " · 1 open" : ""}
          </span>
        </li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link className="btn btn-primary" to={`/duel?vs=${other.profile.id}`}>
          Challenge to a 1v1
        </Link>
        <Link className="btn" to="/me">
          Back to Me
        </Link>
      </div>
    </Page>
  );
}
