// The dev gallery's Growth fixture must look like a real site: these screenshots are the owner UI's evidence.
import { describe, expect, it } from "vitest";
import { RANGES, type Bucket, type Count } from "../../lib/owner";
import { fixtureGrowth, fixtureOverview } from "./fixtures";

const shown = (c: Count) => (c.suppressed ? null : c.value);
const BUCKETS: Bucket[] = ["day", "week", "month"];
const cases = (["busy", "small"] as const).flatMap((site) =>
  RANGES.flatMap((days) => BUCKETS.map((bucket) => ({ site, days, bucket }))),
);

describe("fixture growth", () => {
  it.each(cases)(
    "$site, $days days by $bucket: totals never go negative and sign-ups fit inside them",
    ({ site, days, bucket }) => {
      const g = fixtureGrowth(site, days, bucket);
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
    ({ days, bucket }) => {
      const g = fixtureGrowth("busy", days, bucket);
      expect(shown(g.series[0].total)).not.toBeNull();
    },
  );

  it.each(cases)(
    "$site, $days days by $bucket: no shown group is 1 to 4 below a shown group that holds it",
    ({ site, days, bucket }) => {
      const g = fixtureGrowth(site, days, bucket);
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
    (site) => {
      const o = fixtureOverview(site);
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
