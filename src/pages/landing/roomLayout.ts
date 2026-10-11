// Pure layout numbers for the observatory room, shared by the WebGL scene and the static frame (poster).
// No three.js import here: the poster ships with the landing's first paint and must not pull the 3D chunk in.
// Units are scene units, Y up, stage top at Y = 0, camera on +Z.

export type Vec3 = [number, number, number];

export const ROOM = {
  stageRadius: 5.2,
  stageHeight: 0.12,
  arch: { width: 1.06, depth: 0.26, bevel: 0.035, hMax: 3.7, hMin: 2.5 },
  slit: { z: -5.6, width: 0.5, height: 9 },
  crystal: {
    position: [0, 1.7, 0.35] as Vec3,
    radius: 0.25,
    height: 1.2,
    tip: 0.36,
  },
  rings: [
    { radius: 1.05, tilt: [1.2, 0, 0.32] as Vec3 },
    { radius: 0.92, tilt: [0.2, 0.9, -0.5] as Vec3 },
  ],
  target: [0, 1.6, -0.6] as Vec3,
} as const;

export type Arch = {
  index: number;
  ring: number;
  a: number;
  x: number;
  z: number;
  h: number;
};

export type ColonnadeSpec = { count: number; radius: number; spanDeg: number };

export const COLONNADE_FULL: ColonnadeSpec = {
  count: 7,
  radius: 3.3,
  spanDeg: 58,
};
export const COLONNADE_LITE: ColonnadeSpec = {
  count: 5,
  radius: 3.0,
  spanDeg: 50,
};

/**
 * The fixed framings the static frame is drawn at (ObservatoryPoster) and the pre-rendered stills of the real room were
 * rendered at (stills/), so a still lands exactly on the outline drawing under it. Wide: desktops and landscape
 * tablets; tall: phones and portrait tablets.
 */
export const FRAME_PRESETS = [
  { key: "wide", width: 1440, height: 824, spec: COLONNADE_FULL },
  { key: "tall", width: 390, height: 768, spec: COLONNADE_LITE },
] as const;

export type FramePreset = (typeof FRAME_PRESETS)[number];

/** Arches on an arc around the origin, each facing the centre, tallest in the middle. */
export function archLayout(spec: ColonnadeSpec): Arch[] {
  const { count, radius, spanDeg } = spec;
  const span = (spanDeg * Math.PI) / 180;
  const mid = (count - 1) / 2;
  const out: Arch[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i - mid) / mid; // -1 .. 1
    const a = t * span;
    const h =
      ROOM.arch.hMin +
      (ROOM.arch.hMax - ROOM.arch.hMin) * Math.cos((t * Math.PI) / 2);
    out.push({
      index: i,
      ring: Math.abs(i - mid),
      a,
      x: radius * Math.sin(a),
      z: -radius * Math.cos(a),
      h,
    });
  }
  return out;
}

/** Width of the colonnade seen from the front, in scene units. */
export function colonnadeWidth(spec: ColonnadeSpec): number {
  const span = (spec.spanDeg * Math.PI) / 180;
  return 2 * spec.radius * Math.sin(span) + ROOM.arch.width * Math.cos(span);
}

export type Framing = {
  fov: number;
  position: Vec3;
  target: Vec3;
  /** how far the picture is shifted, as a fraction of the canvas width (+ moves the room right) */
  shiftX: number;
  /** as a fraction of the canvas height (+ moves the room up) */
  shiftY: number;
  wide: boolean;
};

/** Where the settled camera sits for a canvas of this size, so the room fills its side of the hero. */
export function framing(
  width: number,
  height: number,
  spec: ColonnadeSpec,
): Framing {
  const aspect = width / Math.max(1, height);
  const wide = width >= 768 && aspect >= 1.1;
  const fov = wide ? 30 : 40;
  const share = wide ? 0.58 : 0.94; // part of the width the room may take
  const tan = Math.tan(((fov / 2) * Math.PI) / 180);
  const roomW = colonnadeWidth(spec) + 0.5;
  const roomH = ROOM.arch.hMax + 0.8;
  const byWidth = roomW / (share * 2 * tan * aspect);
  const byHeight = roomH / ((wide ? 0.66 : 0.5) * 2 * tan);
  const d = Math.min(30, Math.max(9, byWidth, byHeight));
  const [tx, ty, tz] = ROOM.target;
  return {
    fov,
    position: [tx, ty + 0.25 + d * 0.035, tz + d],
    target: [tx, ty, tz],
    shiftX: wide ? 0.19 : 0,
    shiftY: wide ? 0.03 : 0.17,
    wide,
  };
}

/** Projects a scene point to canvas pixels for a camera at `f` (perspective, then the framing shift). */
export function project(
  p: Vec3,
  f: Framing,
  width: number,
  height: number,
): [number, number] {
  const [px, py, pz] = f.position;
  const [tx, ty, tz] = f.target;
  // camera basis (look-at, world up = +Y)
  let fx = tx - px,
    fy = ty - py,
    fz = tz - pz;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up
  let rx = -fz,
    rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // up = right x forward
  const ux = -rz * fy,
    uy = rz * fx - rx * fz,
    uz = rx * fy;
  const dx = p[0] - px,
    dy = p[1] - py,
    dz = p[2] - pz;
  const x = dx * rx + dz * rz;
  const y = dx * ux + dy * uy + dz * uz;
  const z = dx * fx + dy * fy + dz * fz; // depth in front of the camera
  const tan = Math.tan(((f.fov / 2) * Math.PI) / 180);
  const aspect = width / height;
  const ndcX = x / (z * tan * aspect);
  const ndcY = y / (z * tan);
  return [
    ((ndcX + 1) / 2 + f.shiftX) * width,
    ((1 - ndcY) / 2 - f.shiftY) * height,
  ];
}

/** The arch outline (front face) as points from bottom left, over the head, to bottom right. */
export function archOutline(arch: Arch, segments = 14): Vec3[] {
  const r = ROOM.arch.width / 2;
  const cos = Math.cos(arch.a);
  const sin = Math.sin(arch.a);
  // local (u, v) on the arch face -> world, the face turned by -a about Y and pushed half a depth toward the centre
  const at = (u: number, v: number): Vec3 => {
    const front = ROOM.arch.depth / 2;
    return [arch.x + u * cos - front * sin, v, arch.z + u * sin + front * cos];
  };
  const pts: Vec3[] = [at(-r, 0), at(-r, arch.h - r)];
  for (let s = 1; s < segments; s++) {
    const th = Math.PI - (s / segments) * Math.PI;
    pts.push(at(r * Math.cos(th), arch.h - r + r * Math.sin(th)));
  }
  pts.push(at(r, arch.h - r), at(r, 0));
  return pts;
}

/** A horizontal circle in the scene (stage rim, inlay). */
export function circle(radius: number, y: number, segments = 72): Vec3[] {
  const pts: Vec3[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    pts.push([radius * Math.sin(t), y, radius * Math.cos(t)]);
  }
  return pts;
}

/** Quint ease-out, the JS twin of the app's --ease-out-quint, for scene timelines. */
export function easeOutQuint(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 5);
}

/** Progress (0..1) of a step that starts at `start` and lasts `duration`, eased. */
export function step(time: number, start: number, duration: number): number {
  return easeOutQuint((time - start) / duration);
}

/** When each arch starts rising: the centre first, then pairs outward. */
export function archDelay(arch: Arch): number {
  return 0.25 + 0.13 * arch.ring * 2;
}

/** Seconds until the room has fully assembled (the last arch, the rings and the light). */
export const ASSEMBLY_SECONDS = 4.2;

/**
 * The closing scene's camera: the same room from a lower three-quarter angle (orbited about the target). On a phone
 * the turn is gentler and the camera steps back, so the whole colonnade sits above the closing copy.
 */
export function closeFraming(f: Framing): Framing {
  const ang = f.wide ? -0.55 : -0.32;
  const back = f.wide ? 1 : 1.12;
  const [px, py, pz] = f.position;
  const [tx, ty, tz] = f.target;
  const rx = (px - tx) * back;
  const rz = (pz - tz) * back;
  return {
    ...f,
    position: [
      tx + rx * Math.cos(ang) - rz * Math.sin(ang),
      ty + (py - ty) * back - (f.wide ? 0.55 : 0.3),
      tz + rx * Math.sin(ang) + rz * Math.cos(ang),
    ],
    shiftY: f.wide ? f.shiftY : f.shiftY + 0.06,
  };
}

/** Rotates a point by Euler angles (XYZ order, like three.js) about the origin. */
export function rotateXYZ(p: Vec3, [ax, ay, az]: Vec3): Vec3 {
  // three.js applies the matrix Rx * Ry * Rz for 'XYZ', so z turns first, then y, then x.
  let [x, y, z] = p;
  // z
  let c = Math.cos(az), s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  // y
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  // x
  c = Math.cos(ax); s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
