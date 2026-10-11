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
  /** a WebGL2 context can be created */
  webgl2: boolean;
  /** the GPU is a software rasteriser (no hardware acceleration) */
  software: boolean;
  /** no fine pointer anywhere (phones, tablets): `(any-pointer: fine)` does not match */
  touchOnly: boolean;
  /** how many times the performance monitor has declined the scene this visit */
  declines: number;
};

export const PHONE_WIDTH = 768;

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

type Probe = { webgl2: boolean; renderer: string | null };

/** Creates a throwaway WebGL2 context to see what the GPU is, then releases it. Browser only. */
export function probeWebGL(): Probe {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) return { webgl2: false, renderer: null };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl2: true, renderer };
  } catch {
    return { webgl2: false, renderer: null };
  }
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

/** Reads the browser facts tierFor needs. Only call from an effect (touches the DOM). */
export function readLandingEnv(declines: number): LandingEnv {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const width = window.innerWidth;
  const touchOnly = isTouchOnly();
  // a phone or tablet gets the poster whatever its GPU is, so it is spared the throwaway WebGL context
  const probe =
    width < PHONE_WIDTH || touchOnly
      ? { webgl2: false, renderer: null }
      : probeWebGL();
  return {
    width,
    cores:
      typeof nav.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    webgl2: probe.webgl2,
    software: isSoftwareRenderer(probe.renderer),
    touchOnly,
    declines,
  };
}
