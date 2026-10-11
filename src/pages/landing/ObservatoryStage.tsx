// Decides when the WebGL room is worth paying for, and shows the static frame until it is.
// - Phones and touch-only devices never load it (tier.ts): they get the static frame, drawn from the same layout.
// - The 3D chunk is a separate dynamic import, requested only after the page has loaded (fonts included), an idle
//   slot, and the section being near the viewport, on a tier that allows WebGL. The first paint never waits on it.
// - One room at a time (roomSlot.ts): the hero and the closing section share a slot, so only one canvas exists.
// - Rendering pauses while the canvas is off-screen or the tab is hidden; a room that owns the slot stays mounted
//   (paused) so scrolling back does not rebuild it.
// - The animation clock belongs to this stage, not to a mount, so a rebuilt room (a tier step-down, the slot coming
//   back) carries on settled instead of assembling again.
// - Under reduced motion a capable GPU still gets the real glass, drawn once and held still.
// - Performance declines count for the visit, not the section (roomSlot.ts), and the device facts are read again when
//   a resize crosses the phone width (a desktop window opened narrow, then widened).
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../components/ui/cn";
import { ObservatoryPoster, type PosterVariant } from "./ObservatoryPoster";
import { mayHoldRoom, RoomSlotContext } from "./roomSlot";
import {
  readLandingEnv,
  tierFor,
  widthChangesTier,
  type LandingEnv,
  type Tier,
} from "./tier";

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
  const slot = useContext(RoomSlotContext);
  const clock = useRef(0);
  const [env, setEnv] = useState<LandingEnv | null>(null);
  const [reduced, setReduced] = useState(false);
  const [ownDeclines, setOwnDeclines] = useState(0);
  const [failed, setFailed] = useState(false);
  // the tier whose room has drawn its first frames; cleared when the room goes, so a new mount (a tier change, the
  // slot coming back) always starts behind the static frame instead of showing an unpainted canvas
  const [readyTier, setReadyTier] = useState<Tier | null>(null);
  const [settled, setSettled] = useState(false);
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

  // Width is the one device fact that changes during a visit; only a resize across the phone line is worth a re-read.
  useEffect(() => {
    if (!env) return;
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (widthChangesTier(env.width, window.innerWidth))
          setEnv(readLandingEnv(0));
      }, 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
    };
  }, [env]);

  // The page's own load (fonts, logo, the headline settled as the largest paint) comes first, then two frames, then
  // an idle slot, and only then is the 3D chunk requested. On a slow connection the room must not compete with the
  // fonts for bandwidth.
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

  const declines = slot ? slot.declines : ownDeclines;
  const tier: Tier = env && !failed ? tierFor({ ...env, declines }) : "poster";
  const wantsRoom = tier !== "poster" && idle;

  // coming near the viewport takes the room slot from the other section
  const claim = slot?.claim;
  useEffect(() => {
    if (wantsRoom && near) claim?.(variant);
  }, [wantsRoom, near, claim, variant]);

  const holds = mayHoldRoom(slot, variant);
  const live = wantsRoom && holds && (near || keep);

  // A room that has been built stays mounted (paused) while this section owns the slot, so scrolling back does not
  // rebuild it; losing the slot or falling back to the static frame lets it go.
  useEffect(() => {
    if (live) setKeep(true);
    if (!wantsRoom || !holds) setKeep(false);
  }, [live, wantsRoom, holds]);

  useEffect(() => {
    if (!live) setReadyTier(null);
  }, [live]);
  const ready = live && readyTier === tier;

  // the full tier's effects chunk (bloom, FXAA) downloads beside the scene's, not after it
  useEffect(() => {
    if (live && tier === "full") void import("./scene/Effects");
  }, [live, tier]);

  const onReady = useCallback(() => setReadyTier(tier), [tier]);
  const onSettled = useCallback(() => setSettled(true), []);
  const slotDecline = slot?.decline;
  const onDecline = useCallback(
    () => (slotDecline ? slotDecline() : setOwnDeclines((d) => d + 1)),
    [slotDecline],
  );
  const onFail = useCallback(() => setFailed(true), []);

  // The static frame shows the whole room when that is what the visitor gets, and once the live room has assembled
  // (so a rebuilt room cross-fades from the same picture); before that it shows only the stage and the light.
  const posterState =
    env && (tier === "poster" || failed || settled) ? "room" : "waiting";

  return (
    <div
      ref={hostRef}
      className={cn("obs-stage absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <ObservatoryPoster
        variant={variant}
        state={posterState}
        lite={tier === "lite"}
        className={cn("obs-under", ready && "is-out")}
      />
      {live && (
        <SceneBoundary onFail={onFail}>
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
                clock={clock}
                onReady={onReady}
                onSettled={onSettled}
                onDecline={onDecline}
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}
