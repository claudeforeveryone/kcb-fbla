import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../state";
import { readiness } from "../lib/score";
import { Empty, Loading, Page, pct } from "../components/ui";
import type { Logs, Profile } from "../lib/backend";

export default function Points() {
  const [sp] = useSearchParams();
  const { me, logs, loadUser, topicBy } = useStore();
  const id = sp.get("id");
  const [who, setWho] = useState<
    { profile: Profile; logs: Logs } | null | undefined
  >(id ? undefined : me ? { profile: me, logs } : null);
  useEffect(() => {
    if (id)
      loadUser(id)
        .then((u) => setWho(u ?? null))
        .catch(() => setWho(null));
  }, [id, loadUser]);
  if (who === undefined) return <Loading />;
  if (!who)
    return (
      <Page>
        <Empty title="Member not found" />
      </Page>
    );
  const event = topicBy(sp.get("event") || who.profile.event);
  if (!event)
    return (
      <Page title="Where the points go">
        <Empty
          title="No event chosen"
          action={
            <Link className="btn" to="/settings#prep">
              Choose an event
            </Link>
          }
        />
      </Page>
    );
  const r = readiness(who.logs.answers, event.slug, event.subs);
  const self = who.profile.id === me?.id;
  if (!r.ready)
    return (
      <Page title="Where the points go" sub={event.name}>
        <Empty
          title="Not enough data yet"
          action={
            self ? (
              <Link
                className="btn btn-primary"
                to={`/play/run?kind=practice&topic=${event.slug}`}
              >
                Practice {event.short}
              </Link>
            ) : undefined
          }
        >
          {r.need} more first-attempt questions needed.
        </Empty>
      </Page>
    );
  const rows = [...r.subs].sort(
    (a, b) => b.max - b.points - (a.max - a.points),
  );
  return (
    <Page
      title="Where the points go"
      sub={
        <>
          {self ? "Your" : `${who.profile.name}'s`} predicted{" "}
          <b className="num text-ink">{r.score}</b>/100 on {event.name}, area by
          area. Biggest gaps first.
        </>
      }
    >
      <div className="hidden grid-cols-[1fr_5rem_5rem_5rem_6rem] gap-3 border-b border-rule pb-2 md:grid">
        <span className="label">Area</span>
        <span className="label text-right">Worth</span>
        <span className="label text-right">Accuracy</span>
        <span className="label text-right">Earned</span>
        <span className="label text-right">Left</span>
      </div>
      <ul>
        {rows.map((x) => (
          <li key={x.name} className="border-b border-rule py-3">
            <div className="grid grid-cols-[1fr_auto] gap-x-3 md:grid-cols-[1fr_5rem_5rem_5rem_6rem]">
              <span className="font-semibold">
                {x.name}
                <span className="block text-sm font-normal text-ink-2">
                  {x.seen
                    ? `${x.right}/${x.seen} first tries`
                    : "not tried yet, estimated"}
                </span>
              </span>
              <span className="num hidden text-right md:block">
                {x.max.toFixed(1)}
              </span>
              <span className="num hidden text-right md:block">
                {pct(x.acc)}
              </span>
              <span className="num hidden text-right md:block">
                {x.points.toFixed(1)}
              </span>
              <span className="num text-right font-semibold text-danger">
                −{(x.max - x.points).toFixed(1)}
              </span>
            </div>
            <div className="relative mt-2 h-2 bg-band" aria-hidden>
              <span
                className="absolute inset-y-0 left-0 bg-field dark:bg-gold"
                style={{ width: `${x.acc * 100}%` }}
              />
            </div>
            {self && x.max - x.points > 1 && (
              <Link
                className="link mt-1 inline-block text-sm"
                to={`/play/run?kind=practice&topic=${event.slug}&sub=${encodeURIComponent(x.name)}`}
              >
                Practice this area
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-2">
        Each area is worth its share of the {event.name} bank. Accuracy is your
        first-try rate there, pulled toward your overall rate until you have a
        few answers in the area.
      </p>
    </Page>
  );
}
