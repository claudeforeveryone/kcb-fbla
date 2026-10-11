// Decides when the WebGL room is worth paying for, and shows the static frame until it is.
// - The 3D chunk is a separate dynamic import, requested only after the page has loaded (fonts included), an idle
//   slot, and the section being near the viewport, on a tier that allows WebGL (see tier.ts). The landing's first
//   paint never waits on three.js.
// - Rendering pauses while the canvas is off-screen or the tab is hidden. Phones release the canvas entirely when
//   the section is far away; desktops keep it paused so scrolling back does not recompile shaders.
// - Under reduced motion a capable GPU still gets the real glass, drawn once and held still.
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../components/ui/cn";
import { ObservatoryPoster, type PosterVariant } from "./ObservatoryPoster";
import { readLandingEnv, tierFor, type LandingEnv, type Tier } from "./tier";

const ObservatoryScene = lazy(() => import("./scene/ObservatoryScene"));

/** Keeps a failing scene from taking the page down; the static frame stays on screen. */
class SceneBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function ObservatoryStage({
  variant,
  className,
}: {
  variant: PosterVariant;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [env, setEnv] = useState<LandingEnv | null>(null);
  const [reduced, setReduced] = useState(false);
  const [declines, setDeclines] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [idle, setIdle] = useState(false);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [keep, setKeep] = useState(false);

  // Browser facts (WebGL probe, device hints, motion preference) are read after mount.
  useEffect(() => {
    setEnv(readLandingEnv(0));
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduced(prefersReducedMotion());
    const onChange = () => setReduced(prefersReducedMotion());
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  // The page's own load (fonts, logo, the headline settled as the largest paint) comes first, then two frames, then
  // an idle slot, and only then is the 3D chunk requested. On a slow connection the 350 KB room must not compete
  // with the fonts for bandwidth.
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timer: number | undefined;
    let raf: number | undefined;
    const start = () => {
      if (!cancelled) setIdle(true);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const loaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const fonts = document.fonts?.ready ?? Promise.resolve();
    Promise.all([loaded, fonts]).then(() => {
      if (cancelled) return;
      raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (w.requestIdleCallback)
            idleId = w.requestIdleCallback(start, { timeout: 2000 });
          else timer = window.setTimeout(start, 600);
        }),
      );
    });
    return () => {
      cancelled = true;
      if (raf !== undefined) cancelAnimationFrame(raf);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  // Near the viewport (mount), on screen (render), tab visible (render).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      setOnScreen(true);
      return;
    }
    const nearIo = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: "300px 0px" },
    );
    const seenIo = new IntersectionObserver(([e]) =>
      setOnScreen(e.isIntersecting),
    );
    nearIo.observe(el);
    seenIo.observe(el);
    return () => {
      nearIo.disconnect();
      seenIo.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState !== "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const tier: Tier = env && !failed ? tierFor({ ...env, declines }) : "poster";
  const live = tier !== "poster" && idle && (near || keep);

  // Desktops keep a mounted room (paused) once it exists; phones let it go when it is far away.
  useEffect(() => {
    if (live && tier === "full") setKeep(true);
    if (tier !== "full") setKeep(false);
  }, [live, tier]);

  // A remount (tier change, phone scrolling back) starts from the static frame again.
  useEffect(() => {
    if (!live) setReady(false);
  }, [live, tier]);

  const posterState = env && (tier === "poster" || failed) ? "room" : "waiting";
  const showPoster = !(live && ready);

  return (
    <div
      ref={hostRef}
      className={cn("obs-stage absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <ObservatoryPoster
        variant={variant}
        state={posterState}
        className={cn("obs-fade", !showPoster && "is-out")}
      />
      {live && (
        <SceneBoundary onFail={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div
              className={cn("obs-fade absolute inset-0", !ready && "is-out")}
            >
              <ObservatoryScene
                key={tier}
                tier={tier}
                variant={variant}
                animate={!reduced}
                running={(onScreen && tabVisible) || !ready}
                onReady={() => setReady(true)}
                onDecline={() => setDeclines((d) => d + 1)}
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}
