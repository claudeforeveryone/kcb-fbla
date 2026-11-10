// The signed-out front door, "/" when no one is signed in (App.tsx IndexRoute). Light, flat and quiet: every word is
// HTML in reading order and nothing animates on its own. The only motion is the sample question answering the visitor.
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonClasses } from "../../components/ui/Button";
import { PracticePreview } from "./PracticePreview";
import {
  DISCIPLINES,
  DUEL_QUESTIONS,
  EVENTS,
  MOCK_MINUTES,
  MOCK_QUESTIONS,
  QUESTIONS_PER_EVENT,
  TOTAL_TERMS,
  eventsIn,
  signupFor,
} from "./observatoryEvents";
// landing.css is imported by App.tsx, not here: this module is a lazy chunk, and the prerendered HTML needs the
// styles before it loads.

const PLATFORM = [
  {
    title: "Practice papers",
    body: `Full ${MOCK_QUESTIONS}-question mocks on a ${MOCK_MINUTES}-minute clock, plus Quick 10s and area drills.`,
  },
  {
    title: "Elo and leaderboards",
    body: "Only your first try at a question counts, weighted by difficulty.",
  },
  {
    title: "Vocab",
    body: "Flashcards, Match and Quiz. Terms you miss come back sooner.",
  },
  {
    title: "1v1 duels",
    body: `Same ${DUEL_QUESTIONS} questions for both players. Most correct wins.`,
  },
  {
    title: "Chapters",
    body: "Join with a code. Executives post, assign tests and take attendance.",
  },
  {
    title: "Career stats",
    body: "Every paper is kept with a full review. Misses go into a redo run.",
  },
];

export default function LandingPage() {
  const questions = (EVENTS.length * QUESTIONS_PER_EVENT).toLocaleString("en-CA");
  return (
    <div className="lp">
      {/* hero */}
      <section id="top" aria-labelledby="hero-title" className="lp-hero">
        <div className="lp-wrap grid items-center gap-12 pb-20 pt-14 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:gap-16 lg:pb-28 lg:pt-24">
          <div>
            <h1 id="hero-title" className="lp-h1">
              FBLA practice papers, vocab and 1v1 duels for FBL Canada members
            </h1>
            <p className="lp-lead mt-6 max-w-[44ch]">
              Free. {EVENTS.length} events, {questions} practice questions and {TOTAL_TERMS.toLocaleString("en-CA")} vocab
              terms. Try the sample question first, no account needed.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup" className={buttonClasses("accent", "lg", "lp-cta")}>
                Join free <ArrowRight className="lp-cta-arrow size-4" aria-hidden />
              </Link>
              <Link to="/login" className={buttonClasses("outline", "lg")}>
                Sign in
              </Link>
            </div>
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
          <div className="lp-head">
            <h2 id="platform-title" className="lp-h2" tabIndex={-1}>
              What you get
            </h2>
          </div>
          <ul className="lp-list mt-10">
            {PLATFORM.map((p) => (
              <li key={p.title}>
                <h3 className="lp-h3">{p.title}</h3>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink">{p.body}</p>
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
          <div className="lp-head">
            <h2 id="events-title" className="lp-h2">
              {EVENTS.length} events
            </h2>
          </div>
          <div className="lp-events mt-10">
            {DISCIPLINES.map((d) => (
              <div key={d.id}>
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

      {/* close */}
      <section id="join" aria-labelledby="join-title" className="lp-join">
        <div className="lp-wrap py-20 md:py-28">
          <div className="max-w-[36rem]">
            <h2 id="join-title" className="lp-h2 text-white">
              Start with ten questions
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-white/80">
              Free account. Pick your event and go.
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
