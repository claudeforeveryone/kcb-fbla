// Which rendering tier the landing's glass room uses. Pure so it can be unit tested.
// full: the whole room. lite: fewer arches, lighter glass, no bloom. poster: the static composed frame, no WebGL.
//
// Phones and touch-only devices always get the poster. Measured on the production build (Lighthouse mobile, 4x CPU):
// the room's mount and shader compile added 1.2-1.5 s of blocking time and pushed LCP to 3.8 s, so a visitor tapping
// "Join free" in the first seconds waited on it. The poster is drawn from the same layout numbers, so phones still see
// the room, as a still frame. The WebGL room is for pointer devices: laptops and desktops.

export type Tier = "full" | "lite" | "poster";

export type LandingEnv = {
  /** CSS pixel width of the viewport */
  width: number;
  /** navigator.hardwareConcurrency, null when unknown */
  cores: number | null;
  /** navigator.deviceMemory in GB (Chromium only), null when unknown */
  memoryGb: number | null;
  /** the browser has WebGL2 (whether a context can really be made is learnt when the room makes its own) */
  webgl2: boolean;
  /** the GPU is a software rasteriser (no hardware acceleration); reported by the room's own context */
  software: boolean;
  /** no fine pointer anywhere (phones, tablets): `(any-pointer: fine)` does not match */
  touchOnly: boolean;
  /** how many times the performance monitor has declined the scene this visit (shared by both rooms, roomSlot.ts) */
  declines: number;
};

export const PHONE_WIDTH = 768;

/**
 * The device facts are read once, at mount. Width is the one that changes during a visit (a desktop window opened
 * narrow, then widened): a resize across the phone line is worth reading them again, any other resize is not.
 */
export function widthChangesTier(before: number, after: number): boolean {
  return before < PHONE_WIDTH !== after < PHONE_WIDTH;
}

export function tierFor(env: LandingEnv): Tier {
  if (!env.webgl2 || env.software) return "poster";
  if (env.declines >= 2) return "poster";
  if (env.memoryGb !== null && env.memoryGb <= 2) return "poster";
  if (env.width < PHONE_WIDTH || env.touchOnly) return "poster";
  if (env.declines === 1) return "lite";
  if (env.cores !== null && env.cores <= 4) return "lite";
  if (env.memoryGb !== null && env.memoryGb <= 4) return "lite";
  return "full";
}

/** Renderer strings of rasterisers that run on the CPU. Transmission glass is unusable on them. */
const SOFTWARE =
  /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

export function isSoftwareRenderer(
  renderer: string | null | undefined,
): boolean {
  return !!renderer && SOFTWARE.test(renderer);
}

/** The renderer string of a live WebGL context (unmasked where the browser allows). */
export function rendererOf(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(
    info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
  );
}

/** True when the device has no fine pointer at all (a phone or tablet without a trackpad or mouse). */
function isTouchOnly(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  // browsers without any-pointer support match neither query: treat them as pointer devices
  return (
    window.matchMedia("(any-pointer: coarse)").matches &&
    !window.matchMedia("(any-pointer: fine)").matches
  );
}

/**
 * Reads the browser facts tierFor needs. Only call from an effect (touches the DOM).
 *
 * No WebGL context is made here. A throwaway probe context used to be created at mount to read the GPU's name: a
 * synchronous trip into the GPU process inside the page's first task, and then the room made a second context
 * anyway. Dropping it took that first task from 68-80 ms to 60-61 ms (Playwright, desktop GPU) and Lighthouse
 * desktop's median blocking time from 489 to 236 ms. The room's own context now reports a software rasteriser
 * (ObservatoryScene's onCreated) and is created with failIfMajorPerformanceCaveat, so a device without a usable GPU
 * falls back to the still from there.
 */
export function readLandingEnv(declines: number): LandingEnv {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const width = window.innerWidth;
  const touchOnly = isTouchOnly();
  return {
    width,
    cores:
      typeof nav.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    webgl2: typeof window.WebGL2RenderingContext !== "undefined",
    software: false,
    touchOnly,
    declines,
  };
}
