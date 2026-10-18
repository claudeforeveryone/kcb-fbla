// The signed-out front door, "/" when no one is signed in (App.tsx IndexRoute). Light, flat and quiet: every word is
// HTML in reading order, the only motion is the headline settling in and each section rising once as it scrolls in.
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonClasses } from "../../components/ui/Button";
import { PracticePreview } from "./PracticePreview";
import {
  DISCIPLINES,
  DUEL_ACCEPT_HOURS,
  DUEL_QUESTIONS,
  EVENTS,
  MOCK_MINUTES,
  MOCK_QUESTIONS,
  QUESTIONS_PER_EVENT,
  TERMS_PER_EVENT,
  TOTAL_TERMS,
  eventsIn,
  signupFor,
} from "./observatoryEvents";
// landing.css is imported by App.tsx, not here: this module is a lazy chunk, and the prerendered HTML needs the
// styles before it loads.

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
  const root = useRef<HTMLDivElement>(null);

  // Sections below the hero rise in once as they reach the viewport. Content is visible without JS: the hidden
  // starting state only applies under .lp-js, which is set here, and never under reduced motion (landing.css).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    // anything already on screen shows at once; only what is still below the fold waits for its entrance
    const fold = window.innerHeight;
    for (const item of items) {
      if (item.getBoundingClientRect().top < fold) item.classList.add("is-in");
      else io.observe(item);
    }
    el.classList.add("lp-js");
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root} className="lp">
      {/* hero */}
      <section id="top" aria-labelledby="hero-title" className="lp-hero">
        <div className="lp-wrap grid items-center gap-12 pb-20 pt-14 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:gap-16 lg:pb-28 lg:pt-24">
          <div>
            <p className="lp-kicker">
              <span className="lp-tricolour" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              FBLC United
            </p>
            <h1 id="hero-title" className="lp-h1">
              <span className="lp-line">
                <span style={{ ["--d" as string]: "0ms" }}>Practise for FBLA.</span>
              </span>
              <span className="lp-line">
                <span style={{ ["--d" as string]: "80ms" }}>Compete together.</span>
              </span>
            </h1>
            <p className="lp-lead mt-6 max-w-[40ch]">
              Timed FBLA-style papers for FBL Canada members: {EVENTS.length} events, a first-try Elo rating, vocab
              drills and 1v1 duels.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup" className={buttonClasses("accent", "lg", "lp-cta")}>
                Join free <ArrowRight className="lp-cta-arrow size-4" aria-hidden />
              </Link>
              <Link to="/login" className={buttonClasses("outline", "lg")}>
                Sign in
              </Link>
            </div>
            <dl className="lp-stats mt-12">
              <div>
                <dt>Events</dt>
                <dd>{EVENTS.length}</dd>
              </div>
              <div>
                <dt>Questions</dt>
                <dd>{(EVENTS.length * QUESTIONS_PER_EVENT).toLocaleString("en-CA")}</dd>
              </div>
              <div>
                <dt>Vocab terms</dt>
                <dd>{TOTAL_TERMS.toLocaleString("en-CA")}</dd>
              </div>
            </dl>
          </div>

          {/* a real sample question, not a picture of one */}
          <div id="preview" aria-labelledby="preview-title" className="lp-preview">
            <h2 id="preview-title" className="sr-only">
              Try a sample question
            </h2>
            <PracticePreview />
          </div>
        </div>
      </section>

      {/* what the platform does */}
      <section id="platform" aria-labelledby="platform-title" className="lp-section">
        <div className="lp-wrap">
          <div data-reveal className="lp-head">
            <h2 id="platform-title" className="lp-h2" tabIndex={-1}>
              Built like competition day.
            </h2>
            <p className="lp-body mt-4">
              Timed papers, first-try ratings and leaderboards. Every number on your profile comes from your own answers.
            </p>
          </div>
          <ul className="lp-grid mt-14">
            {PLATFORM.map((p, i) => (
              <li key={p.title} data-reveal style={{ ["--d" as string]: `${(i % 3) * 60}ms` }}>
                <h3 className="lp-h3">{p.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">{p.body}</p>
                <p className="lp-fact mt-4">{p.fact}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-[60ch] text-sm text-muted">
            Questions are written for study from FBLA’s published competency areas, or a standard course outline for a
            few events. They are not official FBLA or FBLC test items.
          </p>
        </div>
      </section>

      {/* the events */}
      <section id="events" aria-labelledby="events-title" className="lp-section lp-tint">
        <div className="lp-wrap">
          <div data-reveal className="lp-head">
            <h2 id="events-title" className="lp-h2">
              Fifteen events.
            </h2>
            <p className="lp-body mt-4">
              Every event has its own {QUESTIONS_PER_EVENT}-question bank and {TERMS_PER_EVENT}-term vocab deck.
            </p>
          </div>
          <div className="lp-events mt-14">
            {DISCIPLINES.map((d) => (
              <div key={d.id} data-reveal>
                <h3 className="lp-discipline">{d.name}</h3>
                <ul>
                  {eventsIn(d.id).map((e) => (
                    <li key={e.slug}>
                      <Link to={signupFor(e.slug)} className="lp-event">
                        <span className="min-w-0 py-2.5 leading-snug">{e.name}</span>
                        <span className="lp-format">{e.format === "case" ? "Case" : "Test"}</span>
                        <ArrowUpRight className="lp-event-arrow size-4 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" aria-labelledby="how-title" className="lp-section">
        <div className="lp-wrap">
          <h2 id="how-title" data-reveal className="lp-h2">
            Pick. Practise. Review. Climb.
          </h2>
          <ol className="lp-steps mt-14">
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <span className="lp-step-no">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="lp-h3 mt-5">{s.title}</h3>
                <p className="mt-2 max-w-[32ch] text-[0.9375rem] leading-relaxed text-ink">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* close */}
      <section id="join" aria-labelledby="join-title" className="lp-join">
        <div className="lp-wrap py-20 md:py-28">
          <div data-reveal className="max-w-[36rem]">
            <h2 id="join-title" className="lp-h2 text-white">
              Your first Quick 10 takes about five minutes.
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-white/80">
              Make a free account, pick your main event and start. Your rating begins at 0 and moves from your very first
              answer.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup" className={buttonClasses("accent", "lg", "lp-cta")}>
                Join free <ArrowRight className="lp-cta-arrow size-4" aria-hidden />
              </Link>
              <Link to="/login" className={buttonClasses("inverse", "lg")}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
