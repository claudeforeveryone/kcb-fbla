// The signed-out front door, "/" when no one is signed in (App.tsx IndexRoute). Every word is HTML in reading
// order; the glass room behind the hero and the closing section is decoration that arrives after first paint.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import { EventNetwork } from "./EventNetwork";
import type { PosterVariant } from "./ObservatoryPoster";
import { ObservatoryStage } from "./ObservatoryStage";
import { PracticePreview } from "./PracticePreview";
import { shouldPlayIntro } from "./intro";
import { RoomSlotContext, type RoomOwner } from "./roomSlot";
import {
  DUEL_ACCEPT_HOURS,
  DUEL_QUESTIONS,
  EVENTS,
  MOCK_MINUTES,
  MOCK_QUESTIONS,
  QUESTIONS_PER_EVENT,
  TERMS_PER_EVENT,
  TOTAL_TERMS,
} from "./observatoryEvents";
import "./observatory.css";

// Read once, before React replaces the document: was this page's static HTML already on screen?
const PRERENDERED =
  typeof document !== "undefined" &&
  !!document.querySelector("#root .observatory");

// Runs before paint in the browser, and is skipped on the server (prerender).
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const PLATFORM = [
  {
    title: "Practice papers",
    body: `Full mocks run ${MOCK_QUESTIONS} questions in ${MOCK_MINUTES} minutes, like the real objective test. Quick 10s, a daily challenge, area drills and endless mode fill the days between.`,
    fact: `${EVENTS.length} events, ${QUESTIONS_PER_EVENT} questions each`,
  },
  {
    title: "Elo and leaderboards",
    body: "Your rating moves on your first try at each question, weighted by difficulty, so repeats can’t farm points. Player and chapter boards show where you stand.",
    fact: "Starts at 0. First tries only.",
  },
  {
    title: "Vocab with spaced repetition",
    body: "Learn, Flashcards, Match and Quiz over each event’s deck. Terms you miss come back sooner; the ones you know spread out.",
    fact: `${TERMS_PER_EVENT} terms per event, ${TOTAL_TERMS} in all`,
  },
  {
    title: "1v1 Arena duels",
    body: `Challenge anyone to the same ${DUEL_QUESTIONS} questions on a server clock. Most correct wins, and time breaks a tie.`,
    fact: `Accept within ${DUEL_ACCEPT_HOURS} hours`,
  },
  {
    title: "Chapters and classroom",
    body: "Join with a code or an invite link. Executives run the roster, roles, attendance and trainers; the classroom holds posts, newsletters, assignments, custom tests and decks.",
    fact: "Join by code or link",
  },
  {
    title: "Career stats",
    body: "Every paper you sit is kept with a question-by-question review. Missed questions go into a redo run, and your weak spots show up on Home.",
    fact: "Every paper kept",
  },
];

const STEPS = [
  {
    title: "Pick",
    body: `Choose your event from ${EVENTS.length}. Each has its own question bank, vocab deck and competency areas.`,
  },
  {
    title: "Practise",
    body: `Sit a full mock on the ${MOCK_MINUTES}-minute clock, or run a Quick 10 between classes.`,
  },
  {
    title: "Review",
    body: "Every answer comes with an explanation. Missed questions wait for you in a redo run.",
  },
  {
    title: "Climb",
    body: "First tries move your Elo. Player and chapter leaderboards show where you stand.",
  },
];

export default function LandingPage() {
  // the hero and the closing section share one WebGL room (see roomSlot.ts)
  const [roomOwner, setRoomOwner] = useState<RoomOwner>(null);
  const [declines, setDeclines] = useState(0);
  const claimRoom = useCallback((who: PosterVariant) => setRoomOwner(who), []);
  const decline = useCallback(() => setDeclines((d) => d + 1), []);
  const roomSlot = useMemo(
    () => ({ owner: roomOwner, claim: claimRoom, declines, decline }),
    [roomOwner, claimRoom, declines, decline],
  );
  return (
    <RoomSlotContext.Provider value={roomSlot}>
      <Landing />
    </RoomSlotContext.Provider>
  );
}

function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(false);
  const [js, setJs] = useState(false);

  // Decide on the headline reveal before the first browser paint, so the text never jumps.
  useBeforePaint(() => {
    const reducedMotion = !!window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const fcp =
      performance.getEntriesByName?.("first-contentful-paint")[0]?.startTime ??
      null;
    setIntro(
      shouldPlayIntro({
        reducedMotion,
        firstContentfulPaint: fcp,
        now: performance.now(),
        prerendered: PRERENDERED,
      }),
    );
    setJs(true);
  }, []);

  // The how-it-works path draws once, when it first comes into view.
  useEffect(() => {
    const path = root.current?.querySelector<HTMLElement>(".obs-path");
    if (!path) return;
    if (!("IntersectionObserver" in window)) {
      path.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          path.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(path);
    return () => io.disconnect();
  }, []);

  const skip = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIntro(false);
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("platform")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
    document.getElementById("platform-title")?.focus({ preventScroll: true });
  };

  return (
    <div ref={root} className={cn("observatory", js && "obs-js")}>
      {/* hero */}
      <section
        id="top"
        aria-labelledby="hero-title"
        className={cn("obs-hero", intro && "obs-intro")}
      >
        <ObservatoryStage variant="hero" />
        <div className="obs-scrim" aria-hidden="true" />
        <div className="obs-wrap relative pb-14 pt-24 md:pb-20">
          <div className="max-w-[44rem]">
            <h1 id="hero-title" className="obs-h1">
              <span className="obs-line">
                <span style={{ ["--d" as string]: "0ms" }}>The Leadership</span>
              </span>
              <span className="obs-line">
                <span style={{ ["--d" as string]: "90ms" }}>Observatory</span>
              </span>
            </h1>
            <span className="obs-rule mt-7" aria-hidden="true" />
            <p
              className="obs-lead obs-up mt-6 max-w-[24ch]"
              style={{ ["--d" as string]: "650ms" }}
            >
              Where serious future business leaders prepare.
            </p>
            <p
              className="obs-body obs-up mt-4 max-w-[44ch]"
              style={{ ["--d" as string]: "730ms" }}
            >
              Timed FBLA-style papers for FBLC members: {EVENTS.length} events,
              a first-try Elo rating, vocab drills and 1v1 duels.
            </p>
            <div
              className="obs-up mt-8 flex flex-wrap items-center gap-3"
              style={{ ["--d" as string]: "810ms" }}
            >
              <Link to="/signup" className={buttonClasses("accent", "lg")}>
                Join free <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/login" className="obs-btn-line">
                Sign in
              </Link>
              {/* the skip path: moves focus to the first section's heading */}
              <a href="#platform" className="obs-skip sm:ml-2" onClick={skip}>
                See what’s inside
                <ArrowDown className="ml-1.5 size-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* what the platform does */}
      <section
        id="platform"
        aria-labelledby="platform-title"
        className="obs-section"
      >
        <div className="obs-wrap grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <h2
              id="platform-title"
              tabIndex={-1}
              className="obs-h2 outline-none"
            >
              Built like competition day.
            </h2>
            <p className="obs-body mt-6">
              Timed papers, first-try ratings and leaderboards. Every number on
              your profile comes from your own answers, and your chapter sees
              the same ones.
            </p>
            <p className="obs-small mt-6 max-w-[52ch]">
              Questions are written for study from FBLA’s published competency
              areas. They are not official FBLA or FBLC test items.
            </p>
          </div>
          <div className="obs-ledger">
            {PLATFORM.map((p) => (
              <div key={p.title}>
                <h3 className="obs-h3">{p.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-white/80">
                  {p.body}
                </p>
                <p className="obs-fact mt-4">{p.fact}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* the event network */}
      <section
        id="events"
        aria-labelledby="events-title"
        className="obs-section bg-[#001a52]"
      >
        <div className="obs-wrap">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h2 id="events-title" className="obs-h2 max-w-[18ch]">
                Fifteen events. Five disciplines. One map.
              </h2>
              <p className="obs-body mt-6">
                Every event has its own {QUESTIONS_PER_EVENT}-question bank and{" "}
                {TERMS_PER_EVENT}-term vocab deck. Pick one to see what it
                covers.
              </p>
            </div>
          </div>
          <div className="mt-10">
            <EventNetwork />
          </div>
        </div>
      </section>

      {/* a sample paper */}
      <section
        id="preview"
        aria-labelledby="preview-title"
        className="obs-section"
      >
        <div className="obs-wrap grid items-start gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-20">
          <div className="lg:pt-6">
            <h2 id="preview-title" className="obs-h2">
              Try a sample question.
            </h2>
            <p className="obs-body mt-6">
              Three questions written in the style of the Accounting,
              Entrepreneurship and Business Law banks, with the feedback the app
              gives after every answer.
            </p>
            <p className="obs-small mt-4 max-w-[48ch]">
              They are not in the banks, so you won’t meet them again in the
              app. The rating here is a sample: it starts at 0, like a new
              member’s, and moves by the same rule the app uses. Nothing you
              click is saved.
            </p>
          </div>
          <PracticePreview />
        </div>
      </section>

      {/* how it works */}
      <section id="how" aria-labelledby="how-title" className="obs-section">
        <div className="obs-wrap">
          <h2 id="how-title" className="obs-h2">
            Pick. Practise. Review. Climb.
          </h2>
          <ol className="obs-path mt-14">
            {STEPS.map((s) => (
              <li key={s.title} className="obs-step">
                <h3 className="obs-h3 text-[1.45rem]">{s.title}</h3>
                <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-white/80">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* close */}
      <section
        id="join"
        aria-labelledby="join-title"
        className="obs-section obs-close"
      >
        <ObservatoryStage variant="close" />
        <div className="obs-scrim" aria-hidden="true" />
        <div className="obs-wrap relative pb-2 pt-16 md:py-16">
          <div className="max-w-[34rem]">
            <h2 id="join-title" className="obs-h2">
              Your first Quick 10 takes about five minutes.
            </h2>
            <p className="obs-body mt-6">
              Make a free account, pick your main event and start. Your rating
              begins at 0 and moves from your very first answer.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup" className={buttonClasses("accent", "lg")}>
                Join free <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/login" className="obs-btn-line">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
