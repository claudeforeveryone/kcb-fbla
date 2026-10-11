import { describe, expect, it } from "vitest";
import {
  DISCIPLINES,
  EVENTS,
  QUESTIONS_PER_EVENT,
  TERMS_PER_EVENT,
  TOTAL_TERMS,
  eventsIn,
  signupFor,
} from "./observatoryEvents";

type Bank = {
  slug: string;
  name: string;
  group: string;
  subs: string[];
  notes: string;
  questions: unknown[];
  vocab: unknown[];
};

// The real question banks, read at test time (Vite resolves the JSON).
const files = import.meta.glob("../../../content/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Bank>;
const banks: Record<string, Bank> = Object.fromEntries(
  Object.values(files).map((b) => [b.slug, b]),
);

describe("landing event data", () => {
  it("lists every content bank exactly once", () => {
    expect(Object.keys(banks)).toHaveLength(15);
    expect(EVENTS.map((e) => e.slug).sort()).toEqual(Object.keys(banks).sort());
    expect(new Set(EVENTS.map((e) => e.slug)).size).toBe(EVENTS.length);
  });

  it("matches each bank on name, format and competency areas", () => {
    for (const e of EVENTS) {
      const b = banks[e.slug];
      expect(e.name, e.slug).toBe(b.name);
      expect(e.format, e.slug).toBe(b.group);
      expect(e.areas, e.slug).toEqual(b.subs);
    }
  });

  it("every bank has the advertised question and term counts", () => {
    for (const b of Object.values(banks)) {
      expect(b.questions.length, b.slug).toBe(QUESTIONS_PER_EVENT);
      expect(b.vocab.length, b.slug).toBe(TERMS_PER_EVENT);
    }
    const terms = Object.values(banks).reduce((n, b) => n + b.vocab.length, 0);
    expect(TOTAL_TERMS).toBe(terms);
  });

  it("places every event in exactly one discipline, and every discipline has events", () => {
    const ids = DISCIPLINES.map((d) => d.id);
    const placed = ids.flatMap((id) => eventsIn(id).map((e) => e.slug));
    expect(placed.sort()).toEqual(EVENTS.map((e) => e.slug).sort());
    for (const d of DISCIPLINES)
      expect(eventsIn(d.id).length, d.id).toBeGreaterThan(0);
  });

  it("flags exactly the events whose areas are a standard outline, not FBLA's (the bank's notes say so)", () => {
    // the notes of these banks say their areas are a standard curriculum outline, not (yet) FBLA's own list
    const outline =
      /areas are (?:therefore )?(?:the )?standard|use (?:the )?standard|not yet been remapped/i;
    const fromNotes = Object.values(banks)
      .filter((b) => outline.test(b.notes))
      .map((b) => b.slug)
      .sort();
    expect(fromNotes).toEqual([
      "entrepreneurship",
      "international-business",
      "organizational-leadership",
    ]);
    expect(
      EVENTS.filter((e) => e.areasFrom === "outline")
        .map((e) => e.slug)
        .sort(),
    ).toEqual(fromNotes);
  });

  it("builds sign-up links that come back to the event page", () => {
    expect(signupFor("business-law")).toBe(
      "/signup?next=%2Fplay%2Fbusiness-law",
    );
  });
});
