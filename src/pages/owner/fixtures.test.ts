// The dev gallery's Growth fixture must look like a real site: these screenshots are the owner UI's evidence.
import { describe, expect, it } from "vitest";
import { RANGES, type Bucket, type Count } from "../../lib/owner";
import * as fixtures from "./fixtures";
import { FIXTURE_MARKER, fixtureSource, smallFixtureSource } from "./fixtures";

const source = (site: "busy" | "small") => (site === "busy" ? fixtureSource : smallFixtureSource);
const fixtureGrowth = (site: "busy" | "small", days: number, bucket: Bucket) => source(site).growth(days, bucket);
const fixtureOverview = (site: "busy" | "small") => source(site).overview();
const shown = (c: Count) => (c.suppressed ? null : c.value);

describe("fixture marker (scripts/check-dist.mjs looks for it in dist/)", () => {
  // check-dist can only catch fixture data that carries the marker. If every exported value holds it, no import of
  // fixture data, from any file, can reach a bundle without it.
  it("is part of every value fixtures.ts exports", () => {
    for (const [name, value] of Object.entries(fixtures)) {
      if (name === "FIXTURE_MARKER") continue;
      expect((value as { fixture?: unknown }).fixture, name).toBe(FIXTURE_MARKER);
    }
  });
});
const BUCKETS: Bucket[] = ["day", "week", "month"];
const cases = (["busy", "small"] as const).flatMap((site) =>
  RANGES.flatMap((days) => BUCKETS.map((bucket) => ({ site, days, bucket }))),
);

describe("fixture growth", () => {
  it.each(cases)(
    "$site, $days days by $bucket: totals never go negative and sign-ups fit inside them",
    async ({ site, days, bucket }) => {
      const g = await fixtureGrowth(site, days, bucket);
      for (const t of [g.baseline, ...g.series.map((b) => b.total)]) {
        if (shown(t) != null) expect(shown(t)).toBeGreaterThanOrEqual(0);
      }
      for (const b of g.series) {
        const total = shown(b.total);
        const signups = shown(b.signups);
        const onboarded = shown(b.onboarded);
        const active = shown(b.active);
        if (signups != null && onboarded != null)
          expect(onboarded).toBeLessThanOrEqual(signups);
        if (total != null && active != null)
          expect(active).toBeLessThanOrEqual(total);
      }
    },
  );

  it.each(cases.filter((c) => c.site === "busy"))(
    "busy site, $days days by $bucket: the total line starts at the first bucket",
    async ({ days, bucket }) => {
      const g = await fixtureGrowth("busy", days, bucket);
      expect(shown(g.series[0].total)).not.toBeNull();
    },
  );

  it.each(cases)(
    "$site, $days days by $bucket: no shown group is 1 to 4 below a shown group that holds it",
    async ({ site, days, bucket }) => {
      const g = await fixtureGrowth(site, days, bucket);
      const close = (big: Count, small: Count) => {
        const a = shown(big);
        const b = shown(small);
        return a != null && b != null && a - b >= 1 && a - b <= 4;
      };
      g.series.forEach((b, i) => {
        for (const inner of [b.active, b.practising, b.onboarded]) {
          for (const later of g.series.slice(i))
            expect(close(later.total, inner)).toBe(false);
        }
        expect(close(b.active, b.practising)).toBe(false);
        expect(close(b.active, b.onboarded)).toBe(false);
      });
    },
  );
});

describe("fixture overview", () => {
  it.each(["busy", "small"] as const)(
    "%s: no active window is 1 to 4 below the accounts or the finished sign-ups",
    async (site) => {
      const o = await fixtureOverview(site);
      for (const outer of [o.accounts, o.onboarding.all_time.onboarded]) {
        for (const inner of [
          o.active.dau,
          o.active.wau,
          o.active.mau,
          o.returning,
          o.answered_week.users,
        ]) {
          const a = shown(outer);
          const b = shown(inner);
          expect(a != null && b != null && a - b >= 1 && a - b <= 4).toBe(
            false,
          );
        }
      }
    },
  );
});
