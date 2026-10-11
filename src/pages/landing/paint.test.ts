import { afterEach, describe, expect, it, vi } from "vitest";
import { PAINT_WAIT_MS, whenPainted, type PaintEnv } from "./paint";

/** A browser whose paint entries the test controls. */
function fakeBrowser({ paintedAlready = false, canObserve = true } = {}) {
  let listener: (() => void) | null = null;
  let painted = paintedAlready;
  const env: PaintEnv = {
    hasPainted: () => painted,
    observePaint: canObserve
      ? (onPaint) => {
          listener = onPaint;
          return () => {
            listener = null;
          };
        }
      : null,
  };
  return {
    env,
    paint() {
      painted = true;
      listener?.();
    },
    get listening() {
      return listener !== null;
    },
  };
}

/** Whether the promise has settled after the microtask queue drains. */
async function settled(p: Promise<unknown>) {
  let done = false;
  void p.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

afterEach(() => vi.useRealTimers());

describe("whenPainted", () => {
  it("resolves at once when the page has already painted", async () => {
    const b = fakeBrowser({ paintedAlready: true });
    expect(await settled(whenPainted(b.env))).toBe(true);
    expect(b.listening).toBe(false);
  });

  it("waits for the first paint, then stops listening", async () => {
    const b = fakeBrowser();
    const p = whenPainted(b.env);
    expect(await settled(p)).toBe(false);
    expect(b.listening).toBe(true);
    b.paint();
    expect(await settled(p)).toBe(true);
    expect(b.listening).toBe(false);
  });

  it("does not hold anything back where paints cannot be observed", async () => {
    const b = fakeBrowser({ canObserve: false });
    expect(await settled(whenPainted(b.env))).toBe(true);
  });

  it("gives up waiting after PAINT_WAIT_MS, so decoration is never held forever", async () => {
    vi.useFakeTimers();
    const b = fakeBrowser();
    const p = whenPainted(b.env);
    vi.advanceTimersByTime(PAINT_WAIT_MS - 1);
    expect(await settled(p)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await settled(p)).toBe(true);
    expect(b.listening).toBe(false);
  });

  it("copes with a paint reported while it subscribes", async () => {
    const env: PaintEnv = {
      hasPainted: () => false,
      observePaint: (onPaint) => {
        onPaint();
        return () => {};
      },
    };
    expect(await settled(whenPainted(env))).toBe(true);
  });
});
