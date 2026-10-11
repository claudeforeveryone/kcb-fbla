// The real room as a still picture, for the visitors who never get the live canvas: phones, tablets and devices
// without a usable GPU (tier.ts). Each still is one settled frame of the WebGL scene itself, full-tier glass and bloom,
// rendered at the static frame's own framings (stills/render.tsx), so it lands exactly on the outline frame under it.
//
// It is decoration that arrives late on purpose: requested only after the page has loaded and gone idle (the stage
// decides when), at low priority, and drawn into a 2D canvas rather than shown as an <img>. An <img> covering most of
// the hero would become the page's largest contentful paint the moment it arrived; canvas pixels are not an LCP
// candidate, the same as the live room's canvas, so the headline stays the LCP element as designed.
import { useEffect, useRef, useState } from "react";
import { cn } from "../../components/ui/cn";
import type { PosterVariant } from "./ObservatoryPoster";
import { placeStill } from "./stillPlacement";
import closeTall from "./stills/room-close-tall.webp";
import closeWide from "./stills/room-close-wide.webp";
import heroTall from "./stills/room-hero-tall.webp";
import heroWide from "./stills/room-hero-wide.webp";

const SOURCES: Record<PosterVariant, { wide: string; tall: string }> = {
  hero: { wide: heroWide, tall: heroTall },
  close: { wide: closeWide, tall: closeTall },
};

/** The same split as the outline frames (observatory.css .obs-poster--wide) and roomLayout's framing(). */
const WIDE = "(min-width: 768px) and (min-aspect-ratio: 11/10)";

/**
 * The last row of each tall still that is brighter than white text allows (luminance over 0.30, under 3:1), as a
 * fraction of its height: the crystal's core and the glow at its base. Measured on the WebP files; re-measure when
 * the stills are re-rendered.
 */
const TALL_BRIGHT_BOTTOM: Record<PosterVariant, number> = {
  hero: 0.4362,
  close: 0.3763,
};

/** The phone scrim is solid stage colour over the bottom 36% of the section (observatory.css .obs-scrim). */
const SCRIM_SOLID = 0.36;

/** Space kept between the bright core and the heading, in CSS pixels. */
const CLEAR_GAP = 12;

/**
 * The top of the crystal's rings in each tall still (fraction of its height: the first row with the rings' warm gold
 * in the middle 40% of the width, measured on the WebP files like TALL_BRIGHT_BOTTOM) and
 * the margin it keeps below the canvas top: on the shortest phones the crystal stays whole under the top bar.
 */
const TALL_CRYSTAL_TOP: Record<PosterVariant, number> = { hero: 0.2428, close: 0.1992 };
const CRYSTAL_MARGIN = 24;

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.setAttribute("fetchpriority", "low");
  img.src = src;
  return img.decode().then(() => img);
}

/**
 * Draws `img` over the whole canvas, cropped to cover and centred (the outline frames' xMidYMid slice). With `clear`
 * (a tall picture on a phone), lifted so the bright core ends above that heading (stillPlacement.ts).
 */
function drawCover(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  clear: { el: HTMLElement; brightBottom: number; crystalTop: number } | null,
) {
  const rect = canvas.getBoundingClientRect();
  // the stills are 1.5x (wide) and 2x (tall); a denser canvas would only upscale them
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const p = placeStill({
    cw: w,
    ch: h,
    iw: img.naturalWidth,
    ih: img.naturalHeight,
    brightBottom: clear?.brightBottom ?? 1,
    clearY: clear ? (clear.el.getBoundingClientRect().top - rect.top) * dpr : null,
    gap: CLEAR_GAP * dpr,
    overscan: SCRIM_SOLID * h,
    top: clear ? { fraction: clear.crystalTop, margin: CRYSTAL_MARGIN * dpr } : undefined,
  });
  ctx.imageSmoothingQuality = "high";
  // a lifted picture leaves the bottom strip empty (under the solid scrim): clear what an earlier draw left there
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, p.x, p.y, p.w, p.h);
}

export function ObservatoryStill({
  variant,
  clearOf,
  load,
  onShown,
  onFailed,
}: {
  variant: PosterVariant;
  /** id of the section's heading: on a phone the tall picture keeps its bright core above it */
  clearOf?: string;
  /** start fetching (the stage sets this once the page is idle and the section is near) */
  load: boolean;
  onShown: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!load || !canvas) return;
    let cancelled = false;
    let current: HTMLImageElement | null = null;
    const cache = new Map<string, Promise<HTMLImageElement>>();
    const mq = window.matchMedia?.(WIDE);

    const clearFor = () => {
      const el = clearOf ? document.getElementById(clearOf) : null;
      return el && !mq?.matches
        ? {
            el,
            brightBottom: TALL_BRIGHT_BOTTOM[variant],
            crystalTop: TALL_CRYSTAL_TOP[variant],
          }
        : null;
    };

    const show = () => {
      const src = SOURCES[variant][mq?.matches ? "wide" : "tall"];
      let p = cache.get(src);
      if (!p) {
        p = loadImage(src);
        cache.set(src, p);
      }
      p.then(
        (img) => {
          if (cancelled) return;
          current = img;
          drawCover(canvas, img, clearFor());
          setShown(true);
          onShown();
        },
        () => {
          if (!cancelled) onFailed();
        },
      );
    };
    show();

    // a resize clears and redraws the canvas; crossing the wide/tall line swaps the picture
    const ro =
      "ResizeObserver" in window
        ? new ResizeObserver(() => {
            if (current) drawCover(canvas, current, clearFor());
          })
        : null;
    ro?.observe(canvas);
    mq?.addEventListener?.("change", show);
    return () => {
      cancelled = true;
      ro?.disconnect();
      mq?.removeEventListener?.("change", show);
    };
  }, [load, variant, clearOf, onShown, onFailed]);

  return (
    <canvas
      ref={ref}
      className={cn(
        "obs-still absolute inset-0 h-full w-full",
        shown && "is-on",
      )}
      aria-hidden="true"
    />
  );
}
