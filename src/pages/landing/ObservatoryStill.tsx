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

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.setAttribute("fetchpriority", "low");
  img.src = src;
  return img.decode().then(() => img);
}

/** Draws `img` over the whole canvas, cropped to cover and centred: the outline frames' xMidYMid slice. */
function drawCover(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const rect = canvas.getBoundingClientRect();
  // the stills are 1.5x (wide) and 2x (tall); a denser canvas would only upscale them
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function ObservatoryStill({
  variant,
  load,
  onShown,
  onFailed,
}: {
  variant: PosterVariant;
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
          drawCover(canvas, img);
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
            if (current) drawCover(canvas, current);
          })
        : null;
    ro?.observe(canvas);
    mq?.addEventListener?.("change", show);
    return () => {
      cancelled = true;
      ro?.disconnect();
      mq?.removeEventListener?.("change", show);
    };
  }, [load, variant, onShown, onFailed]);

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
