// "Has the page painted yet?" Decoration (the still of the room, the live room) waits for the browser to have put the
// page's own content on screen, as well as for load and an idle slot (ObservatoryStage). Load alone is not enough: a
// browser can finish loading well before its first frame reaches the screen (a GPU process still starting, measured
// at 470 ms in headless Chrome against a 64 ms load), and work started in that gap delays the frame that shows the
// headline. Pure so it can be unit tested; browserPaintEnv() is the browser's side.

export type PaintEnv = {
  /** the browser has already recorded a paint of this page */
  hasPainted: () => boolean;
  /** calls back on the page's next paint entry; returns a stop function. null where paints cannot be observed */
  observePaint: ((onPaint: () => void) => () => void) | null;
};

/** The longest decoration waits for a paint it was told about but never saw. */
export const PAINT_WAIT_MS = 4000;

export function whenPainted(env: PaintEnv): Promise<void> {
  const observe = env.observePaint;
  // nothing to wait for, or no way to know: the other gates (load, an idle slot) still apply
  if (env.hasPainted() || !observe) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    let stop: (() => void) | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop?.();
      resolve();
    };
    const timer = setTimeout(finish, PAINT_WAIT_MS);
    stop = observe(finish);
    // a paint reported while subscribing finished before `stop` existed
    if (done) stop();
  });
}

/** The browser's paint timing (first-paint / first-contentful-paint entries). Call in the browser only. */
export function browserPaintEnv(): PaintEnv {
  const canObserve =
    typeof PerformanceObserver !== "undefined" &&
    !!PerformanceObserver.supportedEntryTypes?.includes("paint");
  return {
    hasPainted: () =>
      (performance.getEntriesByType?.("paint")?.length ?? 0) > 0,
    observePaint: canObserve
      ? (onPaint) => {
          const po = new PerformanceObserver((list) => {
            if (list.getEntries().length > 0) onPaint();
          });
          po.observe({ type: "paint", buffered: true });
          return () => po.disconnect();
        }
      : null,
  };
}
