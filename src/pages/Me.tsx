import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useStore, derive, type Derived } from "../state";
import { RankBadge } from "../components/RankBadge";
import {
  Bar,
  Empty,
  Loading,
  Page,
  Stat,
  dur,
  int,
  pct,
  secs,
  signed,
  since,
} from "../components/ui";
import { READY_MIN, readiness, ratingAt, TIERS } from "../lib/score";
import { LEVELS, type Logs, type Profile } from "../lib/backend";
import type { Topic } from "../lib/content";

export default function Me() {
  const { id } = useParams();
  const store = useStore();
  const { me, logs, words, loadUser } = store;
  const self = !id || id === me?.id;
  const [other, setOther] = useState<
    { profile: Profile; logs: Logs } | null | undefined
  >(self ? null : undefined);
  useEffect(() => {
    if (self) {
      setOther(null);
      return;
    }
    setOther(undefined);
    loadUser(id!)
      .then((u) => setOther(u ?? null))
      .catch(() => setOther(null));
  }, [id, self, loadUser]);

  const profile = self ? me : other?.profile;
  const plogs = self ? logs : other?.logs;
  const dd = useMemo(
    () =>
      self ? store.d : plogs && profile ? derive(plogs, profile.id, []) : null,
    [self, store.d, plogs, profile],
  );

  if (!self && other === undefined)
    return <Loading label="Opening the record" />;
  if (!profile || !plogs || !dd)
    return (
      <Page>
        <Empty
          title="Member not found"
          action={
            <Link className="btn" to="/">
              Back to the board
            </Link>
          }
        />
      </Page>
    );
  return (
    <Record
      profile={profile}
      logs={plogs}
      d={dd}
      self={self}
      wordCount={self ? words.length : 0}
    />
  );
}

function Record({
  profile,
  logs,
  d,
  self,
}: {
  profile: Profile;
  logs: Logs;
  d: Derived;
  self: boolean;
  wordCount: number;
}) {
  const { profiles, rivalOf, topicBy, totalQuestions } = useStore();
  const ranked = [...profiles].sort((a, b) => b.rating - a.rating);
  const place = ranked.findIndex((p) => p.id === profile.id) + 1;
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const change = d.rating - ratingAt(d.history, weekAgo);
  const rival = rivalOf(profile);
  const gap = rival ? Math.round(d.rating) - Math.round(rival.rating) : 0;
  const event = topicBy(profile.event);
  const s = d.summary;
  const startedAt =
    logs.answers[0]?.at ?? logs.reviews[0]?.at ?? profile.created_at;
  const q = self ? "" : `?id=${profile.id}`;

  return (
    <Page>
      <header className="pb-8">
        <div className="label">
          Candidate Record · {self ? "You" : profile.name.split(" ")[0]}
        </div>
        <div className="mt-1 text-ink-2">
          {place ? (
            <>
              Ranked <b className="num text-ink">#{place}</b> of{" "}
              {profiles.length}{" "}
              {profiles.length === 1 ? "candidate" : "candidates"}
            </>
          ) : (
            "Unranked"
          )}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <span
            className={
              "display flex h-20 w-20 shrink-0 items-center justify-center text-5xl md:h-24 md:w-24 md:text-6xl " +
              (self ? "bg-gold text-on-gold" : "bg-field text-on-field")
            }
            aria-hidden
          >
            {(profile.name.trim()[0] || "?").toUpperCase()}
          </span>
          <h1 className="display min-w-0 break-words text-5xl md:text-7xl">
            {profile.name}
          </h1>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="label">Rating</div>
            <div className="display num text-6xl">{int(d.rating)}</div>
          </div>
          <div className="pb-1">
            <div className="label">7 days</div>
            <div
              className={
                "display num text-3xl " +
                (change > 0.5 ? "text-ok" : change < -0.5 ? "text-danger" : "")
              }
            >
              {signed(Math.round(change))}
            </div>
          </div>
          <div className="pb-1">
            <div className="label">Peak</div>
            <div className="display num text-3xl">{int(d.peak)}</div>
          </div>
        </div>
        <p className="mt-3 text-ink-2">
          {rival ? (
            gap === 0 ? (
              <>
                Dead level with{" "}
                <Link className="link" to={`/u/${rival.id}`}>
                  {rival.name}
                </Link>
                .
              </>
            ) : (
              <>
                <b className="num text-ink">{int(Math.abs(gap))}</b>{" "}
                {gap > 0 ? "ahead of" : "behind"}{" "}
                <Link className="link" to={`/u/${rival.id}`}>
                  {rival.name}
                </Link>
                .
              </>
            )
          ) : (
            "No one to compare with yet."
          )}{" "}
          Tracking since {since(startedAt)}.
        </p>
      </header>
      <hr className="border-rule" />

      <section
        className="panel mt-8 grid md:grid-cols-2"
        aria-label="Exam level and readiness"
      >
        <LevelSide profile={profile} event={event} self={self} />
        <ReadySide logs={logs} event={event} q={q} self={self} />
      </section>

      <Mastery d={d} total={totalQuestions} />

      <section className="mt-8" aria-label="Performance">
        <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Answered"
            value={int(s.answered)}
            sub={`${int(s.unique)} unique`}
          />
          <Stat
            label="Accuracy"
            value={pct(s.accuracy)}
            sub={`${pct(s.firstAccuracy)} first try`}
          />
          <Stat
            label="Mastered"
            value={int(d.mastery.mastered)}
            sub={`of ${int(totalQuestions)}`}
          />
          <Stat
            label="Open misses"
            value={int(d.mastery.openMisses.length)}
            sub="still to fix"
            to={
              self && d.mastery.openMisses.length
                ? "/play/run?kind=fix"
                : undefined
            }
            action="Fix them"
          />
          <Stat
            label="Best streak"
            value={int(s.bestStreak)}
            sub={`${int(s.curStreak)} current`}
          />
          <Stat
            label="Day streak"
            value={int(s.dayStreak)}
            sub={`record ${int(s.dayRecord)}`}
          />
          <Stat
            label="Time studied"
            value={dur(s.timeMs)}
            sub={`${dur(s.weekMs)} this week`}
          />
          <Stat
            label="Per question"
            value={s.perQuestionMs == null ? "—" : secs(s.perQuestionMs)}
            sub="average"
          />
          <Stat
            label="1v1"
            value={`${s.wins}–${s.losses}`}
            sub={`${s.duels} played`}
            to={self ? "/duel" : undefined}
            action={self ? "Challenge" : undefined}
          />
          <Stat
            label="Best paper"
            value={s.bestPaper == null ? "—" : pct(s.bestPaper)}
            sub={`${s.papers} completed`}
            to={self ? "/play" : undefined}
            action={self && !s.papers ? "Take one" : undefined}
          />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        {self ? (
          <>
            <Link
              className="btn flex-1 sm:flex-none"
              to={rival ? `/u/${rival.id}` : "/"}
            >
              Team Profile
            </Link>
            <Link
              className="btn flex-1 sm:flex-none"
              to={rival ? `/compare/${rival.id}` : "/compare"}
            >
              Compare
            </Link>
            <Link className="btn flex-1 sm:flex-none" to="/settings">
              Settings
            </Link>
          </>
        ) : (
          <>
            <Link
              className="btn btn-primary flex-1 sm:flex-none"
              to={`/compare/${profile.id}`}
            >
              Compare with you
            </Link>
            <Link
              className="btn flex-1 sm:flex-none"
              to={`/duel?vs=${profile.id}`}
            >
              Challenge to a 1v1
            </Link>
            <Link className="btn flex-1 sm:flex-none" to="/">
              Back to the board
            </Link>
          </>
        )}
      </div>
    </Page>
  );
}

function LevelSide({
  profile,
  event,
  self,
}: {
  profile: Profile;
  event: Topic | undefined;
  self: boolean;
}) {
  const date = profile.comp_dates?.[profile.level];
  const days = date
    ? Math.ceil((new Date(date + "T00:00:00").getTime() - Date.now()) / 864e5)
    : null;
  return (
    <div className="border-b border-rule p-5 md:border-b-0 md:border-r">
      <div className="label">Exam level</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className="display text-6xl">{event?.short ?? "—"}</span>
        <span className="text-ink-2">{event?.name ?? "No event chosen"}</span>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        aria-label="Competition level"
      >
        {LEVELS.map((l) => (
          <span
            key={l.id}
            className={
              "px-2 py-1 text-sm font-semibold " +
              (l.id === profile.level
                ? "bg-field text-on-field"
                : "border border-rule text-ink-2")
            }
          >
            {l.id}
          </span>
        ))}
        {self && (
          <Link to="/settings#prep" className="link ml-1 text-sm">
            Change
          </Link>
        )}
      </div>
      {days != null && (
        <p className="mt-3 text-sm">
          <b className="num">
            {days > 0
              ? `${days} days`
              : days === 0
                ? "Today"
                : `${-days} days ago`}
          </b>{" "}
          {days > 0 ? `to ${profile.level}` : ""} ·{" "}
          {new Date(date + "T12:00:00").toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
      {self && (
        <>
          <p className="mt-4 text-ink-2">
            Choose your events, competition level and dates so practice, weak
            spots and readiness all aim at your actual competition.
          </p>
          <Link to="/settings#prep" className="btn mt-3">
            Set up exam prep
          </Link>
        </>
      )}
    </div>
  );
}

function ReadySide({
  logs,
  event,
  q,
  self,
}: {
  logs: Logs;
  event: Topic | undefined;
  q: string;
  self: boolean;
}) {
  if (!event)
    return (
      <div className="p-5">
        <div className="label">Exam readiness</div>
        <p className="mt-3 text-ink-2">
          {self
            ? "Pick an event and readiness shows up here."
            : "No event chosen yet."}
        </p>
      </div>
    );
  const r = readiness(logs.answers, event.slug, event.subs);
  return (
    <div className="p-5">
      <div className="label">Exam readiness · {event.short}</div>
      {r.ready ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="display num text-7xl">{r.score}</span>
            <span className="text-ink-2">/ 100</span>
          </div>
          <p className="text-ink-2">
            Likely score{" "}
            <b className="num text-ink">
              {r.low}–{r.high}
            </b>
          </p>
          <div className="relative mt-5 h-8" aria-hidden>
            <div className="absolute inset-x-0 top-3 h-2 bg-band" />
            <div
              className="absolute top-3 h-2 bg-gold"
              style={{
                left: `${r.low}%`,
                width: `${Math.max(1, r.high - r.low)}%`,
              }}
            />
            <div
              className="absolute top-0 h-8 w-1 -translate-x-1/2 bg-ink"
              style={{ left: `${r.score}%` }}
            />
          </div>
          <div className="num flex justify-between text-xs text-ink-2">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            From {r.used} first-attempt {event.name} questions. The range
            tightens as you answer more.
          </p>
          <Link to={`/me/points${q}`} className="link mt-2 inline-block">
            See where the points go
          </Link>
        </>
      ) : (
        <>
          <p className="display mt-2 text-4xl text-ink-2">Not yet</p>
          <p className="mt-2 text-ink-2">
            Answer <b className="num text-ink">{r.need}</b> more first-attempt{" "}
            {event.name} questions (of {READY_MIN}) for a readiness estimate.
          </p>
          <div className="mt-3">
            <Bar
              value={r.used / READY_MIN}
              label="Questions toward a readiness estimate"
            />
          </div>
          {self && (
            <Link
              className="btn btn-primary mt-4"
              to={`/play/run?kind=practice&topic=${event.slug}`}
            >
              Practice {event.short}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Mastery({ d, total }: { d: Derived; total: number }) {
  const t = d.tier;
  return (
    <section className="panel mt-8 p-5" aria-labelledby="mastery-h">
      <div className="label">Mastery rank</div>
      <div className="mt-2 flex items-center gap-4">
        <RankBadge rank={t.rank} level={t.level} size={88} />
        <div className="min-w-0">
          <h2 id="mastery-h" className="display text-5xl">
            {t.name}
          </h2>
          <p className="text-ink-2">
            <b className="num text-ink">{int(d.mastery.mastered)}</b> mastered
            of {int(total)}
            {t.next ? (
              <>
                {" "}
                · <b className="num text-ink">{int(t.toNext!)}</b> more to{" "}
                {t.next.name}
              </>
            ) : (
              " · top of the ladder"
            )}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Bar
          value={t.progress}
          label={t.next ? `Progress to ${t.next.name}` : "Top rank"}
          tone="gold"
        />
      </div>
      <p className="mt-3 text-sm text-ink-2">
        A question is mastered when you get it right on the first try, or right
        twice in a row after that. Mastery only goes up; rating can go both
        ways.
      </p>
      <details className="group mt-4 border-t border-rule pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <ChevronDown
            size={18}
            className="transition-transform group-open:rotate-180"
            aria-hidden
          />{" "}
          The whole ladder
        </summary>
        <ol className="mt-3 grid gap-x-6 sm:grid-cols-3">
          {TIERS.map((x) => {
            const here = x.index === t.index;
            const reached = d.mastery.mastered >= x.at;
            return (
              <li
                key={x.index}
                className={
                  "flex items-center gap-2 border-b border-rule py-1.5 " +
                  (here ? "bg-band font-bold" : reached ? "" : "text-ink-2")
                }
              >
                <RankBadge rank={x.rank} level={x.level} size={22} />
                <span className="flex-1">{x.name}</span>
                <span className="num text-sm">
                  {x.at === 0 ? "start" : `${int(x.at)}`}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-ink-2">
          Numbers are questions mastered. Each rank has three tiers, I to III.
        </p>
      </details>
    </section>
  );
}
