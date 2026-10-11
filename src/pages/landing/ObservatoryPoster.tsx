// The static composed frame of the observatory room: the first paint behind the headline, the picture on devices
// that get no WebGL (software GPUs, very low memory, repeated slow frames), and the fallback if the scene fails.
// It is projected from the same layout numbers and camera framing as the WebGL scene, so the live room cross-fades
// in over it in place. Two framings ship (wide desktop, portrait phone); CSS shows the one that fits.
//
// `waiting` shows the stage and the gold light only (the room assembles when the scene arrives). `room` adds the
// colonnade, the crystal and the armillary rings.
import { useMemo } from "react";
import { cn } from "../../components/ui/cn";
import {
  COLONNADE_LITE,
  FRAME_PRESETS,
  ROOM,
  archLayout,
  archOutline,
  circle,
  closeFraming,
  framing,
  project,
  rotateXYZ,
  type ColonnadeSpec,
  type FramePreset,
  type Framing,
  type Vec3,
} from "./roomLayout";

export type PosterState = "waiting" | "room";
export type PosterVariant = "hero" | "close";

type Preset = FramePreset;
const PRESETS = FRAME_PRESETS;

const path = (pts: Array<[number, number]>, close = false) =>
  pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ") + (close ? " Z" : "");

function drawing(preset: Preset, variant: PosterVariant, spec: ColonnadeSpec) {
  const base = framing(preset.width, preset.height, spec);
  const f: Framing = variant === "close" ? closeFraming(base) : base;
  const P = (p: Vec3) => project(p, f, preset.width, preset.height);

  const stage = path(circle(ROOM.stageRadius, 0).map(P), true);
  const inlay = path(circle(ROOM.stageRadius - 0.15, 0.004).map(P), true);
  const [slitX, slitTop] = P([0, ROOM.slit.height - 1.5, ROOM.slit.z]);
  const [, slitBottom] = P([0, 0, ROOM.slit.z]);
  const [slitRight] = P([ROOM.slit.width / 2, 2, ROOM.slit.z]);
  const slitHalf = Math.max(2, slitRight - slitX);
  const [horizonX, horizonY] = P([0, 0, -ROOM.stageRadius]);
  const [poolX, poolY] = P([0, 0, ROOM.crystal.position[2]]);
  const [poolRight] = P([1.4, 0, ROOM.crystal.position[2]]);

  const arches = archLayout(spec)
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((a) => {
      const outline = archOutline(a);
      const r = ROOM.arch.width / 2;
      const flutes: string[] = [];
      for (let k = 1; k < 9; k++) {
        const u = -r + (k / 9) * ROOM.arch.width;
        const top = a.h - r + Math.sqrt(Math.max(0, r * r - u * u));
        const lean = Math.sin(a.a);
        const front = ROOM.arch.depth / 2;
        const at = (v: number): Vec3 => [
          a.x + u * Math.cos(a.a) - front * lean,
          v,
          a.z + u * lean + front * Math.cos(a.a),
        ];
        flutes.push(path([P(at(0.05)), P(at(top - 0.06))]));
      }
      return { key: a.index, outline: path(outline.map(P), true), flutes };
    });

  const [cx, cy, cz] = ROOM.crystal.position;
  const { radius, height, tip } = ROOM.crystal;
  const crystal = path(
    [
      P([cx, cy + height / 2 + tip, cz]),
      P([cx + radius, cy + height / 2, cz]),
      P([cx + radius, cy - height / 2, cz]),
      P([cx, cy - height / 2 - tip, cz]),
      P([cx - radius, cy - height / 2, cz]),
      P([cx - radius, cy + height / 2, cz]),
    ],
    true,
  );
  const crystalSpine = path([
    P([cx, cy + height / 2 + tip, cz]),
    P([cx, cy - height / 2 - tip, cz]),
  ]);

  const rings = ROOM.rings.map((ring) => {
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= 96; s++) {
      const t = (s / 96) * Math.PI * 2;
      const local = rotateXYZ(
        [ring.radius * Math.cos(t), ring.radius * Math.sin(t), 0],
        ring.tilt,
      );
      pts.push(P([local[0] + cx, local[1] + cy, local[2] + cz]));
    }
    return path(pts);
  });

  return {
    stage,
    inlay,
    slit: { x: slitX, top: slitTop, bottom: slitBottom, half: slitHalf },
    horizon: { x: horizonX, y: horizonY },
    pool: { x: poolX, y: poolY, r: Math.max(8, poolRight - poolX) },
    arches,
    crystal,
    crystalSpine,
    rings,
  };
}

function Frame({
  preset,
  variant,
  state,
  lite,
}: {
  preset: Preset;
  variant: PosterVariant;
  state: PosterState;
  lite: boolean;
}) {
  // the frame under a lite-tier room shows the lite colonnade, so the room cross-fades in over the same arches
  const spec = lite ? COLONNADE_LITE : preset.spec;
  const d = useMemo(
    () => drawing(preset, variant, spec),
    [preset, variant, spec],
  );
  const id = `obs-${preset.key}-${variant}`;
  const { width: W, height: H } = preset;
  return (
    <svg
      className={cn(
        "obs-poster absolute inset-0 h-full w-full",
        `obs-poster--${preset.key}`,
      )}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-dawn`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F4AB19" stopOpacity="0.42" />
          <stop offset="1" stopColor="#F4AB19" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-slit`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FFE6A8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#F6CC6B" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F4AB19" stopOpacity="0" />
        </linearGradient>
        {/* centred on the slit's foot, so the glow fades out on every side instead of ending in a box */}
        <radialGradient id={`${id}-halo`} cx="0.5" cy="1" r="0.5">
          <stop offset="0" stopColor="#F4AB19" stopOpacity="0.26" />
          <stop offset="0.35" stopColor="#F4AB19" stopOpacity="0.1" />
          <stop offset="1" stopColor="#F4AB19" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D6E4FF" stopOpacity="0.16" />
          <stop offset="0.7" stopColor="#F6CC6B" stopOpacity="0.07" />
          <stop offset="1" stopColor="#F6CC6B" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id={`${id}-crystal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE6A8" stopOpacity="0.7" />
          <stop offset="1" stopColor="#F4AB19" stopOpacity="0.3" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-2" width="5">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <radialGradient id={`${id}-pool`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F6CC6B" stopOpacity="0.3" />
          <stop offset="1" stopColor="#F6CC6B" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse
        cx={d.horizon.x}
        cy={d.horizon.y}
        rx={W * 0.42}
        ry={H * 0.11}
        fill={`url(#${id}-dawn)`}
      />
      <rect
        x={d.slit.x - d.slit.half * 8}
        y={d.slit.bottom - 2 * (d.slit.bottom - d.slit.top)}
        width={d.slit.half * 16}
        height={2 * (d.slit.bottom - d.slit.top)}
        fill={`url(#${id}-halo)`}
      />
      <rect
        x={d.slit.x - d.slit.half * 0.45}
        y={d.slit.top}
        width={d.slit.half * 0.9}
        height={d.slit.bottom - d.slit.top}
        fill={`url(#${id}-slit)`}
        filter={`url(#${id}-soft)`}
      />

      <path d={d.stage} fill="#06143A" />
      <path
        d={d.inlay}
        fill="none"
        stroke="#F4AB19"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />

      <g className={cn("obs-poster-room", state === "room" && "is-on")}>
        <ellipse
          cx={d.pool.x}
          cy={d.pool.y}
          rx={d.pool.r}
          ry={d.pool.r * 0.32}
          fill={`url(#${id}-pool)`}
        />
        {d.arches.map((a) => (
          <g key={a.key}>
            <path
              d={a.outline}
              fill={`url(#${id}-glass)`}
              stroke="#D6E4FF"
              strokeOpacity="0.55"
              strokeWidth="1.2"
            />
            {a.flutes.map((fl, i) => (
              <path
                key={i}
                d={fl}
                stroke="#F6CC6B"
                strokeOpacity="0.16"
                strokeWidth="1"
                fill="none"
              />
            ))}
          </g>
        ))}
        {d.rings.map((r, i) => (
          <path
            key={i}
            d={r}
            fill="none"
            stroke="#F4AB19"
            strokeOpacity="0.85"
            strokeWidth="1.4"
          />
        ))}
        <path
          d={d.crystal}
          fill={`url(#${id}-crystal)`}
          stroke="#F6CC6B"
          strokeOpacity="0.9"
          strokeWidth="1.2"
        />
        <path
          d={d.crystalSpine}
          stroke="#FFE6A8"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}

export function ObservatoryPoster({
  variant,
  state,
  lite = false,
  className,
}: {
  variant: PosterVariant;
  state: PosterState;
  /** the live room behind this frame is the lite tier's (five arches) */
  lite?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("absolute inset-0", className)} aria-hidden="true">
      {PRESETS.map((p) => (
        <Frame
          key={p.key}
          preset={p}
          variant={variant}
          state={state}
          lite={lite}
        />
      ))}
    </div>
  );
}
