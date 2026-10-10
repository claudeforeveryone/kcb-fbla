import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state";
import { Glass } from "../components/Glass";
import { RankBadge } from "../components/RankBadge";
import { Avatar, int, pct } from "../components/ui";
import { tierFor } from "../lib/score";
import type { Profile } from "../lib/backend";

type Sort = "rating" | "mastered" | "answered";
const SORTS: { id: Sort; label: string }[] = [
  { id: "rating", label: "Rating" },
  { id: "mastered", label: "Mastered" },
  { id: "answered", label: "Answered" },
];

const season = () => {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String(y + 1).slice(2)} season`;
};

export default function Board() {
  const { profiles, me, backend } = useStore();
  const [sort, setSort] = useState<Sort>("rating");
  const ranked = useMemo(
    () =>
      [...profiles].sort(
        (a, b) => b.rating - a.rating || b.answered - a.answered,
      ),
    [profiles],
  );
  const rows = useMemo(
    () =>
      [...profiles].sort(
        (a, b) =>
          (b[sort] as number) - (a[sort] as number) || b.rating - a.rating,
      ),
    [profiles, sort],
  );
  const leader = ranked[0] && ranked[0].rating > 0 ? ranked[0] : null;
  const myPlace = me ? ranked.findIndex((p) => p.id === me.id) + 1 : 0;

  return (
    <div>
      <section className="bg-field text-on-field" aria-labelledby="glass-h">
        <div className="mx-auto grid max-w-5xl items-end gap-4 px-4 pt-6 md:grid-cols-[1fr_auto_1fr] md:px-8 md:pt-8">
          <div className="order-2 pb-6 md:order-1 md:pb-10">
            <h1 id="glass-h" className="display text-5xl md:text-6xl">
              The FBLA Glass
            </h1>
            <p className="mt-2 max-w-xs text-on-field-2">
              {leader ? (
                <>
                  Held by <b className="text-on-field">{leader.name}</b> at{" "}
                  {int(leader.rating)}. Take it off them.
                </>
              ) : (
                "Nobody holds it yet. First correct answers claim it."
              )}
            </p>
          </div>
          <div className="order-1 mx-auto h-[300px] w-[260px] md:order-2 md:h-[400px] md:w-[340px]">
            <Glass
              text={{
                name: leader?.name ?? "Unclaimed",
                line: leader ? `Rating ${int(leader.rating)}` : "Rating 0",
                year: season(),
              }}
            />
          </div>
          <div className="order-3 hidden pb-10 text-right md:block">
            {me && myPlace > 0 && (
              <>
                <div className="label text-on-field-2">You</div>
                <div className="display num text-6xl">#{myPlace}</div>
                <div className="text-on-field-2">
                  of {profiles.length}{" "}
                  {profiles.length === 1 ? "member" : "members"}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-16">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-3xl">Chapter leaderboard</h2>
          <div className="flex gap-2" role="group" aria-label="Sort by">
            {SORTS.map((s) => (
              <button
                key={s.id}
                className="chip"
                aria-pressed={sort === s.id}
                onClick={() => setSort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Rating is Elo from your first try at each question, weighted by
          difficulty. Everyone starts at 0.
        </p>

        <ol className="border-t border-rule">
          {rows.map((p, i) => (
            <Row
              key={p.id}
              p={p}
              place={i + 1}
              you={p.id === me?.id}
              sort={sort}
            />
          ))}
        </ol>

        {profiles.length <= 1 && (
          <p className="mt-6 text-ink-2">
            {backend?.kind === "local"
              ? "The full chapter board appears once the chapter database is connected."
              : "You're the only one here so far. Send the link to the chapter."}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  p,
  place,
  you,
  sort,
}: {
  p: Profile;
  place: number;
  you: boolean;
  sort: Sort;
}) {
  const t = tierFor(p.mastered);
  const acc = p.answered ? p.correct / p.answered : null;
  return (
    <li
      className={"rise border-b border-rule " + (you ? "bg-band" : "")}
      style={{ animationDelay: `${Math.min(place, 12) * 30}ms` }}
    >
      <Link
        to={you ? "/me" : `/u/${p.id}`}
        className="grid min-h-16 grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-2 py-2 hover:bg-band md:grid-cols-[3rem_1fr_7rem_6rem_6rem_6rem] md:px-3"
      >
        <span
          className={
            "display num text-2xl " +
            (place === 1 ? "text-gold-ink" : "text-ink-2")
          }
        >
          {place}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={p.name} you={you} />
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold">
              {p.name}
              {you && (
                <span className="ml-2 bg-gold px-1.5 py-0.5 align-middle text-xs font-bold text-on-gold">
                  YOU
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-sm text-ink-2">
              <RankBadge rank={t.rank} level={t.level} size={18} /> {t.name}
            </span>
          </span>
        </span>
        <span className="text-right">
          <span className="display num block text-3xl">
            {int(
              sort === "rating"
                ? p.rating
                : sort === "mastered"
                  ? p.mastered
                  : p.answered,
            )}
          </span>
          <span className="label md:hidden">{sort}</span>
        </span>
        <span className="num hidden text-right md:block">
          <span className="label block">Answered</span>
          {int(p.answered)}
        </span>
        <span className="num hidden text-right md:block">
          <span className="label block">Accuracy</span>
          {pct(acc)}
        </span>
        <span className="num hidden text-right md:block">
          <span className="label block">Mastered</span>
          {int(p.mastered)}
        </span>
      </Link>
    </li>
  );
}
