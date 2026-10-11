// Dev only: draws one settled frame of the real observatory room at one of the static frame's fixed framings
// (FRAME_PRESETS), with the full tier's glass and bloom, for the pre-rendered stills in this folder. Phones, tablets
// and GPU-less devices see those stills instead of a live canvas (tier.ts, ObservatoryStill.tsx).
//
// Served by the dev server at /src/pages/landing/stills/render.html?variant=hero|close&preset=wide|tall&dpr=2 and
// never bundled (`vite build` only reads index.html). The page sets data-settled on <body> once the frame is drawn;
// the capture script screenshots #still at the same device pixel ratio.
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import ObservatoryScene from "../scene/ObservatoryScene";
import { FRAME_PRESETS } from "../roomLayout";

function Still() {
  const q = new URLSearchParams(window.location.search);
  const variant = q.get("variant") === "close" ? "close" : "hero";
  const preset =
    FRAME_PRESETS.find((p) => p.key === q.get("preset")) ?? FRAME_PRESETS[0];
  const dpr = Number(q.get("dpr")) || 2;
  const clock = useRef(0);
  return (
    <div
      id="still"
      style={{
        position: "relative",
        width: preset.width,
        height: preset.height,
        overflow: "hidden",
      }}
    >
      <ObservatoryScene
        tier="full"
        variant={variant}
        colonnade={preset.spec}
        dpr={dpr}
        animate={false}
        running
        clock={clock}
        onReady={() => {}}
        onSettled={() => {
          // two more frames so the composer's output is on screen before the capture
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              document.body.dataset.settled = "1";
            }),
          );
        }}
        onDecline={() => {}}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Still />);
