// A three-question sample run inside the room, built from the app's own pieces (Badge, EloBadge,
// Button, the runner's answer styling) on the app's own white surface. The questions are written for this page in the
// banks' format (samples.ts); the rating is a sample that starts at 0 like a new member's and moves by the app's Elo
// rule (src/lib/elo.ts). Nothing is sent or saved.
//
// Keyboard and screen readers: an answered choice stays focusable (aria-disabled, not disabled), the feedback is
// announced from a live region that was mounted empty, and moving on puts focus on the next question's heading (or
// the result), because the old question, and the button that was pressed, are gone.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button, buttonClasses } from "../../components/ui/Button";
import { EloBadge } from "../../components/ui/EloBadge";
import { cn } from "../../components/ui/cn";
import { nextRatingExact } from "../../lib/elo";
import { DIFFICULTY_LABELS } from "../../lib/types";
import { SAMPLE_QUESTIONS } from "./samples";

const LETTERS = ["A", "B", "C", "D"];

type Run = { index: number; chosen: Array<number | null>; ratings: number[] };

const fresh = (): Run => ({
  index: 0,
  chosen: SAMPLE_QUESTIONS.map(() => null),
  ratings: [0],
});

export function PracticePreview() {
  const [run, setRun] = useState<Run>(fresh);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // set by Next and Try again: the visitor moved on, so focus follows (never on the first render)
  const moved = useRef(false);
  const n = SAMPLE_QUESTIONS.length;
  const done = run.index >= n;
  const q = SAMPLE_QUESTIONS[Math.min(run.index, n - 1)];
  const chosen = done ? null : run.chosen[run.index];
  const revealed = chosen !== null;
  const answered = run.chosen.filter((c) => c !== null).length;
  const right = run.chosen.filter(
    (c, i) => c === SAMPLE_QUESTIONS[i].answer,
  ).length;
  const rating = run.ratings[run.ratings.length - 1];
  const shown = Math.round(rating);
  const delta = revealed
    ? Math.round(run.ratings[run.index + 1]) -
      Math.round(run.ratings[run.index])
    : 0;

  const pick = (choice: number) => {
    if (revealed || done) return;
    setRun((r) => {
      const c = [...r.chosen];
      c[r.index] = choice;
      const before = r.ratings[r.ratings.length - 1];
      const after = nextRatingExact(
        before,
        SAMPLE_QUESTIONS[r.index].diff,
        choice === SAMPLE_QUESTIONS[r.index].answer,
        true,
      );
      return { ...r, chosen: c, ratings: [...r.ratings, after] };
    });
  };

  const next = () => {
    moved.current = true;
    setRun((r) => ({ ...r, index: r.index + 1 }));
  };

  const again = () => {
    moved.current = true;
    setRun(fresh());
  };

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    headingRef.current?.focus();
  }, [run.index, done]);

  return (
    <div className="obs-app overflow-hidden">
      {/* toolbar, as in the exam runner */}
      <div className="border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold text-heading">
              Sample paper
            </div>
            <div className="truncate text-xs text-muted">
              Three sample questions. Nothing is saved.
            </div>
          </div>
          <span className="tabular hidden text-sm font-semibold text-muted sm:inline">
            {right}/{answered} right
          </span>
          <EloBadge elo={shown} size="sm" />
        </div>
        {/* the runner's ProgressBar look (xs, blue), with an accessible name the shared component cannot take
            without also showing a visible label */}
        <div
          className="h-1 w-full overflow-hidden bg-surface-3"
          role="progressbar"
          aria-label="Sample paper progress"
          aria-valuemin={0}
          aria-valuemax={n}
          aria-valuenow={answered}
        >
          <div
            className="h-full bg-blue transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(answered / n) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-4 pb-6 pt-5 sm:px-6 md:pt-7">
        {/* each question, and the result, is keyed: it remounts and slides in (obs-swap, obs-swap-x) */}
        {done ? (
          <div key="done" className="obs-swap py-6">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-xl font-bold text-heading outline-none"
            >
              You got {right} of {n}.
            </h3>
            <p className="mt-2 max-w-prose text-[0.975rem] text-ink">
              A new member who answered like that would sit at{" "}
              <span className="tabular font-semibold">{shown}</span> Elo now. In
              the app every first try counts, every paper is kept, and missed
              questions wait for you in a redo run.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/signup" className={buttonClasses("accent", "md")}>
                Join free <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Button
                variant="outline"
                leftIcon={<RotateCcw className="size-4" aria-hidden />}
                onClick={again}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <div key={q.id} className="obs-swap-x">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Question {run.index + 1} of {n}
              </span>
              <Badge tone="navy">{q.eventName}</Badge>
              {/* neutral, not the runner's blue: blue on its tint measures 4.47:1, under AA for 12 px text */}
              <Badge tone="neutral" className="max-w-full truncate">
                {q.sub}
              </Badge>
              <Badge
                tone={
                  q.diff === 3 ? "red" : q.diff === 1 ? "success" : "neutral"
                }
              >
                {DIFFICULTY_LABELS[q.diff]}
              </Badge>
            </div>

            <h3
              ref={headingRef}
              tabIndex={-1}
              className="mb-5 text-[1.1rem] font-bold leading-snug text-heading outline-none md:text-[1.25rem]"
            >
              {q.q}
            </h3>

            <div className="grid gap-2.5" role="group" aria-label="Choices">
              {q.choices.map((c, i) => {
                const isChosen = chosen === i;
                const isRight = q.answer === i;
                const state = revealed
                  ? isRight
                    ? "right"
                    : isChosen
                      ? "wrong"
                      : "dim"
                  : "idle";
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={isChosen}
                    // not `disabled`: that would drop keyboard focus to the page the moment the answer is picked
                    aria-disabled={revealed || undefined}
                    onClick={() => pick(i)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-[4px] border px-3.5 py-3 text-left transition-[border-color,background-color,opacity] duration-150 ease-out md:px-4",
                      "aria-disabled:cursor-default",
                      state === "idle" &&
                        "border-line bg-surface hover:border-blue/60 hover:bg-surface-2",
                      state === "right" &&
                        "border-success bg-success/10 ring-1 ring-success/50",
                      state === "wrong" &&
                        "border-red bg-red/[0.07] ring-1 ring-red/40",
                      state === "dim" && "border-line bg-surface opacity-55",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-px grid size-7 shrink-0 place-items-center rounded-[2px] font-display text-sm font-bold transition-colors",
                        state === "idle" &&
                          "bg-surface-2 text-muted ring-1 ring-inset ring-line group-hover:bg-blue/10 group-hover:text-blue",
                        state === "right" && "bg-success text-white",
                        state === "wrong" && "bg-red text-white",
                        state === "dim" && "bg-surface-2 text-muted",
                      )}
                      aria-hidden
                    >
                      {state === "right" ? (
                        <Check className="size-4" />
                      ) : state === "wrong" ? (
                        <X className="size-4" />
                      ) : (
                        LETTERS[i]
                      )}
                    </span>
                    <span className="tabular min-w-0 flex-1 pt-0.5 text-[0.975rem] leading-snug text-ink">
                      {c}
                    </span>
                    <span className="sr-only">
                      {state === "right"
                        ? "(correct answer)"
                        : state === "wrong"
                          ? "(your answer, incorrect)"
                          : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* mounted empty with each question, so filling it is announced */}
            <div role="status">
              {revealed && (
                <div
                  className={cn(
                    "obs-swap mt-4 rounded-[4px] border p-4",
                    chosen === q.answer
                      ? "border-success/30 bg-success/[0.06]"
                      : "border-red/25 bg-red/[0.04]",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 font-display font-bold">
                    {chosen === q.answer ? (
                      <>
                        <CheckCircle2
                          className="size-5 text-success"
                          aria-hidden
                        />
                        <span className="text-success">Correct</span>
                      </>
                    ) : (
                      <>
                        <XCircle
                          className="size-5 text-red dark:text-danger"
                          aria-hidden
                        />
                        <span className="text-red dark:text-danger">
                          Not quite. The answer is {LETTERS[q.answer]}.
                        </span>
                      </>
                    )}
                    <span className="tabular ml-auto text-sm font-semibold text-muted">
                      {delta > 0 ? `+${delta}` : delta} Elo
                    </span>
                  </div>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
                    {q.explain}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {delta === 0 && chosen !== q.answer
                      ? "Ratings never go below 0, so a miss costs nothing yet."
                      : `First try at a ${DIFFICULTY_LABELS[q.diff].toLowerCase()} question. A repeat would not move Elo.`}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="accent"
                disabled={!revealed}
                onClick={next}
                rightIcon={<ArrowRight className="size-4" aria-hidden />}
              >
                {run.index === n - 1 ? "See how you did" : "Next question"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
