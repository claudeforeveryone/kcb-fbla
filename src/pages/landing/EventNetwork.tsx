// The event network: a bracket from the room's lens (root) to five discipline hubs to fifteen events, with a
// detail panel for the selected event. On narrow screens, and whenever "List" is chosen, the same data is a grouped
// list with disclosures; the list is complete on its own and is the accessible alternative to the map.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, List, Waypoints } from "lucide-react";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import { COLUMNS, link, networkLayout } from "./networkLayout";
import {
  DISCIPLINES,
  EVENTS,
  FORMAT_LABEL,
  MOCK_MINUTES,
  MOCK_QUESTIONS,
  QUESTIONS_PER_EVENT,
  TERMS_PER_EVENT,
  disciplineOf,
  eventBySlug,
  eventsIn,
  signupFor,
  type LandingEvent,
} from "./observatoryEvents";

type View = "map" | "list";

const GROUPS = DISCIPLINES.map((d) => ({
  id: d.id,
  events: eventsIn(d.id).map((e) => e.slug),
}));

export function EventNetwork() {
  const [view, setView] = useState<View>("map");
  const [slug, setSlug] = useState(EVENTS[0].slug);
  const [hover, setHover] = useState<string | null>(null);
  const selected = eventBySlug(slug) ?? EVENTS[0];

  return (
    <div>
      <div
        className="hidden items-center justify-end xl:flex"
        role="group"
        aria-label="Show the events as"
      >
        <button
          type="button"
          className="obs-toggle"
          aria-pressed={view === "map"}
          onClick={() => setView("map")}
        >
          <Waypoints className="size-4" aria-hidden /> Map
        </button>
        <button
          type="button"
          className="obs-toggle"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <List className="size-4" aria-hidden /> List
        </button>
      </div>

      <div
        className={cn(
          "mt-8 hidden gap-12 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]",
          view === "map" && "xl:grid",
        )}
      >
        <Map
          selected={selected.slug}
          hover={hover}
          onSelect={setSlug}
          onHover={setHover}
        />
        <div className="xl:sticky xl:top-28 xl:self-start">
          <Detail event={selected} />
        </div>
      </div>

      <div className={cn("mt-6 xl:mt-8", view === "map" && "xl:hidden")}>
        <EventList />
      </div>
    </div>
  );
}

function Map({
  selected,
  hover,
  onSelect,
  onHover,
}: {
  selected: string;
  hover: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  const layout = useMemo(() => networkLayout(GROUPS), []);
  const lit = hover ?? selected;
  const litEvent = eventBySlug(lit);
  const litHub = litEvent?.discipline;
  // The links are drawn in pixels (the columns are percentages of the measured width), so the SVG is never
  // stretched: a stretched SVG needs non-scaling strokes, and those draw the lit path's dash in screen units, which
  // broke a level link into dashes.
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth);
    if (!("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = (pct: number) => (pct * w) / 100;
  const rootX = x(COLUMNS.rootX);
  const hubLeft = x(COLUMNS.hubLeft);
  const hubRight = x(COLUMNS.hubRight);
  const eventLeft = x(COLUMNS.eventLeft);

  return (
    <div ref={box} className="obs-map" style={{ height: layout.height }}>
      <svg
        className="obs-map-links"
        viewBox={`0 0 ${Math.max(1, w)} ${layout.height}`}
        aria-hidden="true"
      >
        {w > 0 && (
          <>
            {layout.hubs.map((h) => (
              <path
                key={h.id}
                className="obs-link"
                d={link(rootX, layout.rootY, hubLeft, h.y)}
              />
            ))}
            {layout.events.map((e) => {
              const hub = layout.hubs.find((h) => h.id === e.discipline)!;
              return (
                <path
                  key={e.slug}
                  className="obs-link"
                  d={link(hubRight, hub.y, eventLeft, e.y)}
                />
              );
            })}
            {layout.hubs.map((h) => (
              <path
                key={`lit-${h.id}`}
                className={cn("obs-link-lit", h.id === litHub && "is-on")}
                pathLength={1}
                d={link(rootX, layout.rootY, hubLeft, h.y)}
              />
            ))}
            {layout.events.map((e) => {
              const hub = layout.hubs.find((h) => h.id === e.discipline)!;
              return (
                <path
                  key={`lit-${e.slug}`}
                  className={cn("obs-link-lit", e.slug === lit && "is-on")}
                  pathLength={1}
                  d={link(hubRight, hub.y, eventLeft, e.y)}
                />
              );
            })}
          </>
        )}
      </svg>

      <span
        className="obs-root"
        style={{ left: `${COLUMNS.rootX}%`, top: layout.rootY }}
        aria-hidden="true"
      />

      {layout.hubs.map((h) => {
        const d = DISCIPLINES.find((x) => x.id === h.id)!;
        const first = eventsIn(h.id)[0];
        return (
          <button
            key={h.id}
            type="button"
            className={cn("obs-node obs-hub", h.id === litHub && "is-path")}
            style={{
              left: `${COLUMNS.hubLeft}%`,
              width: `${COLUMNS.hubRight - COLUMNS.hubLeft}%`,
              top: h.y,
              minHeight: layout.rowHeight,
            }}
            aria-label={`${d.name}: show ${first.name}`}
            onClick={() => onSelect(first.slug)}
          >
            <span className="min-w-0 flex-1">{d.name}</span>
            <span className="tabular text-xs font-semibold text-white/65">
              {eventsIn(h.id).length}
            </span>
          </button>
        );
      })}

      {layout.events.map((e) => {
        const ev = eventBySlug(e.slug)!;
        return (
          <button
            key={e.slug}
            type="button"
            className={cn(
              "obs-node",
              e.slug === lit && e.slug !== selected && "is-path",
            )}
            style={{
              left: `${COLUMNS.eventLeft}%`,
              right: 0,
              top: e.y - layout.rowHeight / 2,
              height: layout.rowHeight,
            }}
            aria-pressed={e.slug === selected}
            onClick={() => onSelect(e.slug)}
            onPointerEnter={(ev2) => {
              if (ev2.pointerType === "mouse") onHover(e.slug);
            }}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(null)}
          >
            <span className="min-w-0 flex-1 truncate">{ev.name}</span>
            <span className="shrink-0 text-xs font-medium text-white/65">
              {ev.format === "objective" ? "Test" : "Case"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Detail({ event }: { event: LandingEvent }) {
  const d = disciplineOf(event);
  return (
    <div className="obs-panel relative overflow-hidden">
      {/* One line is announced when the selection changes, not the whole panel (heading, stats, every area and the
          button). The region stays mounted, so only changes are read. */}
      <p className="sr-only" aria-live="polite">
        {`${event.name}: ${FORMAT_LABEL[event.format].toLowerCase()} in ${d.name}, ${event.areas.length} areas.`}
      </p>
      {/* keyed: a new event remounts and fades in (obs-swap) */}
      <div key={event.slug} className="obs-swap p-6 sm:p-8">
        <EventFacts event={event} discipline={d.name} headingLevel="h3" />
      </div>
    </div>
  );
}

function EventFacts({
  event,
  discipline,
  headingLevel,
}: {
  event: LandingEvent;
  discipline?: string;
  headingLevel?: "h3" | "h4";
}) {
  const Heading = headingLevel ?? "h3";
  return (
    <>
      {discipline && (
        <>
          <Heading className="obs-h3 text-[1.6rem] sm:text-[1.85rem]">
            {event.name}
          </Heading>
          <p className="obs-small mt-2">
            {FORMAT_LABEL[event.format]} in {discipline}
            {event.note ? `. ${event.note}.` : "."}
          </p>
        </>
      )}
      <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-white/15 py-4">
        <div>
          <dt className="obs-small">Questions</dt>
          <dd className="obs-fact mt-1 text-xl">{QUESTIONS_PER_EVENT}</dd>
        </div>
        <div>
          <dt className="obs-small">Vocab terms</dt>
          <dd className="obs-fact mt-1 text-xl">{TERMS_PER_EVENT}</dd>
        </div>
        <div>
          <dt className="obs-small">Areas</dt>
          <dd className="obs-fact mt-1 text-xl">{event.areas.length}</dd>
        </div>
      </dl>
      <p className="obs-small mt-5">
        {event.format === "objective"
          ? `A full mock runs ${MOCK_QUESTIONS} questions in ${MOCK_MINUTES} minutes, with these areas weighted like the real test.`
          : `Case events are judged live, so practice here drills the knowledge behind the case: ${QUESTIONS_PER_EVENT} questions across these areas.`}
      </p>
      <ul className="obs-areas mt-3 grid gap-x-6 gap-y-1.5 text-[14px] leading-snug text-white/85 sm:grid-cols-2">
        {event.areas.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <Link
        to={signupFor(event.slug)}
        className={buttonClasses("accent", "md", "mt-7")}
      >
        Practise {event.name} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </>
  );
}

function EventList() {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  return (
    <div className="grid gap-x-12 md:grid-cols-2">
      {DISCIPLINES.map((d) => (
        <section
          key={d.id}
          aria-labelledby={`${base}-${d.id}`}
          className="border-t border-white/25 pb-4 pt-6"
        >
          <h3 id={`${base}-${d.id}`} className="obs-h3">
            {d.name}
          </h3>
          <p className="obs-small mt-1">{d.blurb}</p>
          <ul className="mt-3 divide-y divide-white/10">
            {eventsIn(d.id).map((e) => {
              const isOpen = open === e.slug;
              const panel = `${base}-${e.slug}`;
              return (
                <li key={e.slug}>
                  <button
                    type="button"
                    className="obs-row"
                    aria-expanded={isOpen}
                    aria-controls={panel}
                    onClick={() => setOpen(isOpen ? null : e.slug)}
                  >
                    <span className="min-w-0 flex-1 font-display text-[15px] font-semibold">
                      {e.name}
                    </span>
                    <span className="shrink-0 text-xs text-white/70">
                      {FORMAT_LABEL[e.format]}
                    </span>
                    <ChevronDown
                      className="obs-row-chevron size-4 shrink-0 text-white/70"
                      aria-hidden
                    />
                  </button>
                  <div id={panel} hidden={!isOpen} className="pb-6 pt-1">
                    {e.note && <p className="obs-small">{e.note}.</p>}
                    <EventFacts event={e} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
