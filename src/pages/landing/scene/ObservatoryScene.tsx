// The Leadership Observatory: reeded glass arches rise out of a navy stage, a gold slit of light behind them, light
// through the glass falling on the stage, a quartz crystal held by brass armillary rings. Loaded as its own chunk
// after first paint (see ObservatoryStage). Nothing is fetched: the environment is built from Lightformers and every
// shape and light pattern is procedural.
//
// Refraction: drei's MeshTransmissionMaterial normally renders the whole scene once per glass material. Here the
// scene without its glass is rendered once per frame into one shared buffer, and every glass mesh reads it.
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MeshTransmissionMaterial,
  PerformanceMonitor,
  useFBO,
} from "@react-three/drei";
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Plane,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";
import {
  ASSEMBLY_SECONDS,
  COLONNADE_FULL,
  COLONNADE_LITE,
  ROOM,
  archDelay,
  archLayout,
  closeFraming,
  framing,
  step,
  type Arch,
  type ColonnadeSpec,
} from "../roomLayout";
import { archGeometry, crystalGeometry } from "./geometry";
import {
  beamFragment,
  beamVertex,
  causticFragment,
  fluteFragmentBody,
  fluteFragmentHead,
  fluteVertexBody,
  fluteVertexHead,
  glassRimBody,
  horizonFragment,
  passVertex,
  slitFragment,
} from "./shaders";

/** Bloom and FXAA: a separate chunk that only the full tier loads (see Effects.tsx). */
const Effects = lazy(() => import("./Effects"));

export type SceneTier = "full" | "lite";
export type SceneVariant = "hero" | "close";

export type ObservatorySceneProps = {
  tier: SceneTier;
  variant: SceneVariant;
  /** false under reduced motion: the settled room is drawn once and holds still */
  animate: boolean;
  /** false while the canvas is off-screen or the tab is hidden */
  running: boolean;
  /**
   * Seconds of animation played so far. Owned by the stage and shared by every mount, so a remount (a tier step-down,
   * scrolling back to a released room) carries on from where the room was instead of assembling again.
   */
  clock: MutableRefObject<number>;
  /** the first frames have been drawn (the static frame can fade out) */
  onReady: () => void;
  /** the room has finished assembling (or was drawn settled) */
  onSettled: () => void;
  /** the frame rate stayed too low: step down a tier */
  onDecline: () => void;
  /** the arches to stand up; by default the tier's own (the stills render a phone's five with full-tier glass) */
  colonnade?: ColonnadeSpec;
  /** a fixed pixel ratio instead of the tier's range (the stills render at 2x) */
  dpr?: number;
};

/** Everything below the stage's top surface is cut away, so glass rising out of the floor never shows under the disc. */
const FLOOR_CLIP = [new Plane(new Vector3(0, 1, 0), 0)];

/** Seconds a mount runs before the performance monitor may step it down (shader warm-up frames are slow). */
const DECLINE_GRACE = 3;

const GOLD = "#F4AB19";
const GOLD_SOFT = "#F6CC6B";
const GOLD_HOT = "#FFE6A8";
const STAGE = "#00143F";
const STONE = "#081A4C";
const ICE = "#C9DBFF";

const FLUTES = 9;

// ---- shared refraction buffer -----------------------------------------------------------------------------------

const BufferContext = createContext<Texture | null>(null);

/**
 * Renders the scene once per frame without its glass, and without what stands in front of the glass (the armillary,
 * which would otherwise show up again inside the reeded arches behind it), and hands the result to every glass
 * material.
 */
function RefractionBuffer({
  scale,
  hide,
  children,
}: {
  scale: number;
  hide: Array<MutableRefObject<Group | null>>;
  children: React.ReactNode;
}) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const w = Math.max(2, Math.round(size.width * dpr * scale));
  const h = Math.max(2, Math.round(size.height * dpr * scale));
  const fbo = useFBO(w, h, { samples: 0 });
  useFrame(({ gl, scene, camera }) => {
    const groups = hide.map((r) => r.current);
    if (groups.some((g) => !g)) return;
    groups.forEach((g) => (g!.visible = false));
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(fbo);
    gl.render(scene, camera);
    gl.setRenderTarget(prev);
    groups.forEach((g) => (g!.visible = true));
  }, -1);
  return (
    <BufferContext.Provider value={fbo.texture}>
      {children}
    </BufferContext.Provider>
  );
}

// ---- reeded glass -------------------------------------------------------------------------------------------------

type PatchableMaterial = Material & {
  onBeforeCompile: (
    shader: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer,
  ) => void;
};

/**
 * Wraps drei's transmission shader so the arch's normal is tilted across its width (fluted glass) and its edges carry
 * a thin rim of light (see glassRimBody).
 */
function applyFlutes(
  mat: PatchableMaterial,
  freq: number,
  amp: number,
  rim: number,
) {
  if (mat.userData.fluted) return;
  const base = mat.onBeforeCompile;
  const uniforms = {
    uFluteFreq: { value: freq },
    uFluteAmp: { value: amp },
    uRim: { value: rim },
    uRimColor: { value: new Color(ICE) },
  };
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      fluteVertexHead +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${fluteVertexBody}`,
      );
    shader.fragmentShader =
      fluteFragmentHead +
      shader.fragmentShader
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>\n${fluteFragmentBody}`,
        )
        .replace(
          "#include <tonemapping_fragment>",
          `${glassRimBody}\n#include <tonemapping_fragment>`,
        );
  };
  mat.customProgramCacheKey = () => "obs-reeded-glass";
  mat.userData.fluted = true;
  mat.needsUpdate = true;
}

type GlassLook = {
  samples: number;
  reeded: boolean;
  warm?: boolean;
  /** the crystal's own warmth: higher where the camera does not see the slit through it (the closing scene) */
  glow?: number;
};

/**
 * Hands a material the scene's environment as its own map. three.js ignores `envMapIntensity` for a material lit by
 * `scene.environment` alone (it applies the scene's intensity instead), so without this the glass and the stage would
 * all reflect at one strength whatever they ask for. Same texture, same shader program: nothing recompiles.
 */
function useOwnEnvMap(ref: MutableRefObject<Material | null>) {
  useFrame(({ scene }) => {
    const m = ref.current as (Material & { envMap: Texture | null }) | null;
    const env = scene.environment;
    if (m && env && m.envMap !== env) {
      m.envMap = env;
      m.needsUpdate = true;
    }
  });
}

function Glass({ samples, reeded, warm, glow = 0.06 }: GlassLook) {
  const buffer = useContext(BufferContext);
  const ref = useRef<PatchableMaterial | null>(null);
  useOwnEnvMap(ref);
  useLayoutEffect(() => {
    if (reeded && ref.current)
      applyFlutes(
        ref.current,
        (2 * Math.PI * FLUTES) / ROOM.arch.width,
        0.42,
        // the lite tier has no bloom to lift its edges, so its rim is a little stronger
        samples < 6 ? 0.16 : 0.1,
      );
  }, [reeded, samples]);
  return warm ? (
    // The quartz: gold light passing through it, not an amber block. A low ior and a long attenuation keep the slit
    // behind it readable through the faces (at ior 2.0 and thickness 1.8 the faces bent the view off the slit onto
    // navy and the gold absorption turned what was left brown); a faint gold emission keeps the darkest facet warm.
    <MeshTransmissionMaterial
      ref={ref as never}
      buffer={buffer ?? undefined}
      resolution={2}
      samples={samples}
      transmission={1}
      thickness={0.9}
      roughness={0.02}
      ior={1.55}
      chromaticAberration={0.1}
      anisotropicBlur={0.08}
      distortion={0.04}
      distortionScale={0.35}
      temporalDistortion={0}
      clearcoat={1}
      clearcoatRoughness={0.04}
      specularIntensity={1}
      envMapIntensity={1.6}
      color="#FFFFFF"
      attenuationColor={GOLD_HOT}
      attenuationDistance={5}
      emissive={GOLD}
      emissiveIntensity={glow}
      flatShading
      clippingPlanes={FLOOR_CLIP}
    />
  ) : (
    <MeshTransmissionMaterial
      ref={ref as never}
      buffer={buffer ?? undefined}
      resolution={2}
      samples={samples}
      transmission={1}
      thickness={1.1}
      roughness={0.06}
      ior={1.48}
      chromaticAberration={0.06}
      anisotropicBlur={0.12}
      distortion={0.12}
      distortionScale={0.35}
      temporalDistortion={0.04}
      clearcoat={1}
      clearcoatRoughness={0.05}
      specularIntensity={1}
      envMapIntensity={1.4}
      color="#F4F7FF"
      attenuationColor={ICE}
      attenuationDistance={4}
      clippingPlanes={FLOOR_CLIP}
    />
  );
}

// ---- studio light ---------------------------------------------------------------------------------------------------

type Panel = {
  ring?: boolean;
  color: string;
  intensity: number;
  position: [number, number, number];
  scale: [number, number, number];
};

/** The studio the glass and brass reflect: a tall gold panel behind the room, a cool key, a blue fill, a gold ring. */
const PANELS: Panel[] = [
  {
    color: GOLD_SOFT,
    intensity: 3,
    position: [0, 2.5, -8],
    scale: [2.2, 10, 1],
  },
  { color: ICE, intensity: 1.2, position: [-5, 6, 6], scale: [6, 3, 1] },
  { color: "#3F6FB3", intensity: 0.5, position: [6, 1, 4], scale: [4, 4, 1] },
  {
    ring: true,
    color: GOLD_HOT,
    intensity: 1.5,
    position: [0, 7, 2],
    scale: [2, 2, 2],
  },
];

/**
 * The closing scene's camera stands low at the front right, where the studio has only the blue fill: the brass rings
 * reflected it as dark olive and the crystal's camera-side facets as flat tan. A warm card on that side (a
 * photographer's fill) gives them gold to reflect, as the hero's camera gets from the panels behind and above it.
 */
const CLOSE_FILL: Panel = {
  color: GOLD_SOFT,
  intensity: 3,
  position: [4.5, 1.6, 6.5],
  scale: [5, 5, 1],
};

/** Private parts of three 0.186's PMREMGenerator that let its filter shader be compiled ahead of the bake. */
type PmremInternals = {
  _setSize?: (cubeSize: number) => void;
  _allocateTargets?: () => WebGLRenderTarget;
  _ggxMaterial?: Material | null;
  _lodMeshes?: Mesh[];
};

/**
 * Bakes the studio panels into an environment map: the picture drei's Environment and Lightformer made, built with
 * three's own PMREMGenerator (drei's Environment brought HDR, EXR and gain-map loaders, about 15 KB gzip, that a room
 * lit by four flat panels never uses).
 *
 * The bake itself is synchronous, and its first use of PMREM's GGX filter shader used to wait on that program's link:
 * about 0.3 s of main thread on a desktop GPU under ANGLE/D3D11, in the same task as the room's mount. So the filter,
 * the studio panels and PMREM's background box are compiled first with compileAsync (KHR_parallel_shader_compile,
 * off the main thread), and the bake runs only once they are linked. The filter is compiled on PMREM's own LOD mesh:
 * three keys programs on the geometry's attributes too (position, normal), so any other mesh compiles a sibling
 * program and the bake still stalls. If three's internals ever change shape, the bake still works, with the old stall.
 */
async function bakeStudio(
  gl: WebGLRenderer,
  variant: SceneVariant,
  live: () => boolean,
): Promise<WebGLRenderTarget | null> {
  const studio = new Scene();
  const parts: Array<{ dispose: () => void }> = [];
  for (const p of variant === "close" ? [...PANELS, CLOSE_FILL] : PANELS) {
    const geo = p.ring
      ? new RingGeometry(0.25, 0.5, 64)
      : new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      color: new Color(p.color).multiplyScalar(p.intensity),
      side: DoubleSide,
      toneMapped: false,
    });
    const panel = new Mesh(geo, mat);
    panel.position.set(...p.position);
    panel.scale.set(...p.scale);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    parts.push(geo, mat);
  }
  const pmrem = new PMREMGenerator(gl);
  // the background box PMREM draws behind the scene is created inside the bake; a box with the same material settings
  // compiles the same program now (kept alive until the bake has used it)
  const box = new Mesh(
    new BoxGeometry(),
    new MeshBasicMaterial({ side: BackSide, depthWrite: false, depthTest: false }),
  );
  parts.push(box.geometry, box.material);
  const release = () => {
    pmrem.dispose();
    parts.forEach((x) => x.dispose());
  };

  if (typeof gl.compileAsync === "function") {
    const internals = pmrem as unknown as PmremInternals;
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const cubeCamera = new PerspectiveCamera(90, 1, 0.1, 100);
    const flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pending: Array<Promise<unknown>> = [];
    // the bake draws into half-float targets, so the programs are compiled for a target (linear output)
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    try {
      if (internals._setSize && internals._allocateTargets) {
        internals._setSize(256);
        internals._allocateTargets().dispose();
        const lod = internals._lodMeshes?.[1];
        if (internals._ggxMaterial && lod)
          pending.push(
            gl.compileAsync(
              new Mesh(lod.geometry, internals._ggxMaterial),
              flat,
              studio,
            ),
          );
      }
      pending.push(gl.compileAsync(studio, cubeCamera));
      pending.push(gl.compileAsync(box, cubeCamera, studio));
    } finally {
      gl.setRenderTarget(prev);
      target.dispose();
    }
    await Promise.all(pending);
  }
  if (!live()) {
    release();
    return null;
  }
  const env = pmrem.fromScene(studio, 0, 0.1, 100, { size: 256 });
  release();
  return env;
}

// ---- light ----------------------------------------------------------------------------------------------------------

function useShader(
  fragmentShader: string,
  uniforms: Record<string, { value: unknown }>,
  side = DoubleSide,
) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: passVertex,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side,
      }),
    // the uniforms object is created once by the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/** A quad from a wide source edge (top) to a narrower landing edge (bottom), for a beam of light. */
function beamGeometry(
  top: [number, number, number],
  bottom: [number, number, number],
  wTop: number,
  wBottom: number,
) {
  const dx = bottom[0] - top[0];
  const dz = bottom[2] - top[2];
  const len = Math.hypot(dx, dz) || 1;
  // lateral axis in the floor plane, perpendicular to the beam's direction
  const lx = -dz / len;
  const lz = dx / len;
  const v = new Float32Array([
    top[0] - lx * wTop,
    top[1],
    top[2] - lz * wTop,
    top[0] + lx * wTop,
    top[1],
    top[2] + lz * wTop,
    bottom[0] - lx * wBottom,
    bottom[1],
    bottom[2] - lz * wBottom,
    bottom[0] + lx * wBottom,
    bottom[1],
    bottom[2] + lz * wBottom,
  ]);
  const uv = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(v, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

// ---- the room -------------------------------------------------------------------------------------------------------

type RoomProps = {
  tier: SceneTier;
  variant: SceneVariant;
  colonnade?: ColonnadeSpec;
  animate: boolean;
  onReady: () => void;
  onSettled: () => void;
  clock: MutableRefObject<number>;
  /** seconds this mount has been drawing (unlike `clock`, starts at 0 on every mount) */
  age: MutableRefObject<number>;
  glassRef: MutableRefObject<Group | null>;
  frontRef: MutableRefObject<Group | null>;
  lightRef: MutableRefObject<Group | null>;
};

function Room({
  tier,
  variant,
  colonnade,
  animate,
  onReady,
  onSettled,
  clock,
  age,
  glassRef,
  frontRef,
  lightRef,
}: RoomProps) {
  const spec: ColonnadeSpec =
    colonnade ?? (tier === "full" ? COLONNADE_FULL : COLONNADE_LITE);
  const samples = tier === "full" ? 6 : 3;
  const arches = useMemo(() => archLayout(spec), [spec]);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const archRefs = useRef<Array<Mesh | null>>([]);
  const crystalRef = useRef<Mesh | null>(null);
  const stageMat = useRef<MeshStandardMaterial | null>(null);
  const ringRefs = useRef<Array<Group | null>>([]);
  const pointer = useRef({ x: 0, y: 0, ex: 0, ey: 0 });
  const frames = useRef(0);
  const settled = useRef(false);
  // the stage's low reflection strength only applies with the environment as its own map (see useOwnEnvMap): at full
  // strength the gold Lightformer glared off it and turned the navy olive
  useOwnEnvMap(stageMat);

  // geometry
  const archGeos = useMemo(
    () => arches.map((a) => archGeometry(a.h)),
    [arches],
  );
  const crystalGeo = useMemo(() => crystalGeometry(), []);
  const coreRef = useRef<Mesh | null>(null);
  const coreGeo = useMemo(
    () => new CylinderGeometry(0.07, 0.07, ROOM.crystal.height * 1.1, 16),
    [],
  );
  const coreMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(GOLD_HOT).multiplyScalar(2.2),
        toneMapped: false,
      }),
    [],
  );
  const stageGeo = useMemo(
    () =>
      new CylinderGeometry(
        ROOM.stageRadius,
        ROOM.stageRadius + 0.06,
        ROOM.stageHeight,
        128,
      ),
    [],
  );
  const inlayGeo = useMemo(
    () => new TorusGeometry(ROOM.stageRadius - 0.15, 0.012, 8, 220),
    [],
  );
  const ringGeos = useMemo(
    () => ROOM.rings.map((r) => new TorusGeometry(r.radius, 0.019, 12, 240)),
    [],
  );
  const floorGeo = useMemo(
    () => new CircleGeometry(ROOM.stageRadius - 0.1, 96),
    [],
  );
  const slitGeo = useMemo(
    () => new PlaneGeometry(ROOM.slit.width * 7, ROOM.slit.height),
    [],
  );
  // wide enough that the closing scene's turned camera never reaches its edges
  const horizonGeo = useMemo(() => new PlaneGeometry(56, 9), []);
  const beams = useMemo(() => {
    // a fan of light from the slit, through the centre of the colonnade, onto the stage
    const list = tier === "full" ? [-1, 1, -2.4, 2.4] : [-1, 1];
    return list.map((k) => {
      const top: [number, number, number] = [k * 0.12, 3.4, ROOM.slit.z + 0.4];
      const bottom: [number, number, number] = [k * 0.95, 0.01, 2.2];
      return {
        k,
        geo: beamGeometry(top, bottom, 0.12, Math.abs(k) > 1 ? 0.45 : 0.7),
      };
    });
  }, [tier]);

  // light materials
  const slitUniforms = useMemo(
    () => ({
      uColor: { value: new Color(GOLD) },
      uCore: { value: new Color(GOLD_HOT) },
      uIntensity: { value: 0.3 },
    }),
    [],
  );
  const horizonUniforms = useMemo(
    () => ({ uColor: { value: new Color(GOLD) }, uIntensity: { value: 0.3 } }),
    [],
  );
  const beamUniforms = useMemo(
    () =>
      beams.map((b) => ({
        uColor: { value: new Color(GOLD_SOFT) },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: b.k },
      })),
    [beams],
  );
  const causticUniforms = useMemo(
    () => ({
      uArches: { value: Array.from({ length: 7 }, () => new Vector4()) },
      uCount: { value: arches.length },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uArchWidth: { value: ROOM.arch.width },
      uLines: { value: 6 },
      uColor: { value: new Color(GOLD_SOFT) },
      uWarm: { value: new Color(GOLD) },
    }),
    [arches],
  );
  const slitMat = useShader(slitFragment, slitUniforms);
  const horizonMat = useShader(horizonFragment, horizonUniforms);
  const causticMat = useShader(causticFragment, causticUniforms);
  const beamMats = useMemo(
    () =>
      beamUniforms.map(
        (uniforms) =>
          new ShaderMaterial({
            uniforms,
            vertexShader: beamVertex,
            fragmentShader: beamFragment,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            side: DoubleSide,
          }),
      ),
    [beamUniforms],
  );

  // release GPU objects made here when the room goes away
  useEffect(
    () => () => {
      archGeos.forEach((g) => g.dispose());
      beams.forEach((b) => b.geo.dispose());
      beamMats.forEach((m) => m.dispose());
    },
    [archGeos, beams, beamMats],
  );
  useEffect(
    () => () => {
      [
        crystalGeo,
        coreGeo,
        stageGeo,
        inlayGeo,
        floorGeo,
        slitGeo,
        horizonGeo,
        ...ringGeos,
      ].forEach((g) => g.dispose());
      coreMat.dispose();
    },
    [
      crystalGeo,
      coreGeo,
      coreMat,
      stageGeo,
      inlayGeo,
      floorGeo,
      slitGeo,
      horizonGeo,
      ringGeos,
    ],
  );

  // pointer parallax: desktop, full tier, hero, moving only
  useEffect(() => {
    if (!(animate && tier === "full" && variant === "hero")) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [animate, tier, variant]);

  // settled pictures (reduced motion) are drawn on demand; redraw when the canvas changes size
  useEffect(() => {
    if (!animate) invalidate();
  }, [animate, size.width, size.height, invalidate]);

  const frame = useMemo(() => {
    const f = framing(size.width, size.height, spec);
    return variant === "close" ? closeFraming(f) : f;
  }, [size.width, size.height, spec, variant]);

  useFrame((state, delta) => {
    if (animate) clock.current += Math.min(delta, 1 / 20);
    age.current += delta;
    // the close scene starts assembled and only brings its light up
    const t = animate ? clock.current + (variant === "close" ? 3 : 0) : 60;
    const light =
      variant === "close" && animate ? step(clock.current, 0.2, 2.4) : 1;

    // camera
    const cam = state.camera as PerspectiveCamera;
    const [sx, sy, sz] = frame.position;
    const [tx, ty, tz] = frame.target;
    const dolly = variant === "hero" ? step(t, 0, ASSEMBLY_SECONDS) : 1;
    const px = sx;
    const py = sy - 0.75 * (1 - dolly);
    const pz = sz + 3.4 * (1 - dolly);
    const p = pointer.current;
    const k = 1 - Math.exp(-delta * 2.5);
    p.ex += (p.x - p.ex) * k;
    p.ey += (p.y - p.ey) * k;
    cam.position.set(px + p.ex * 0.3, py - p.ey * 0.15, pz);
    cam.lookAt(tx, ty, tz);
    if (cam.fov !== frame.fov) {
      cam.fov = frame.fov;
      cam.updateProjectionMatrix();
    }
    const w = state.size.width;
    const h = state.size.height;
    const view = cam.view;
    const ox = -frame.shiftX * w;
    const oy = frame.shiftY * h;
    if (
      !view ||
      view.offsetX !== ox ||
      view.offsetY !== oy ||
      view.fullWidth !== w ||
      view.fullHeight !== h
    ) {
      cam.setViewOffset(w, h, ox, oy, w, h);
    }

    // arches rise out of the stage, centre first
    arches.forEach((a: Arch, i) => {
      const m = archRefs.current[i];
      if (!m) return;
      const rise = step(t, archDelay(a), 1.7);
      m.position.y = -(a.h + 0.15) * (1 - rise);
      const reveal = step(t, archDelay(a) + 0.7, 1.4) * light;
      causticUniforms.uArches.value[i].set(a.x, a.z, a.a, reveal);
    });

    // crystal rises and turns into place, then keeps turning
    const c = crystalRef.current;
    if (c) {
      const up = step(t, 0.9, 1.8);
      const [cx, cy, cz] = ROOM.crystal.position;
      c.position.set(cx, 0.25 + (cy - 0.25) * up, cz);
      c.rotation.y = t * 0.16 + (1 - up) * 1.4;
      const s = 0.55 + 0.45 * up;
      c.scale.setScalar(s);
      const core = coreRef.current;
      if (core) {
        core.position.copy(c.position);
        core.scale.setScalar(s);
      }
    }

    // armillary rings swing from flat to their tilts, then drift
    ROOM.rings.forEach((r, i) => {
      const g = ringRefs.current[i];
      if (!g) return;
      const k2 = step(t, 1.5 + i * 0.2, 1.7);
      g.rotation.set(
        r.tilt[0] * k2,
        r.tilt[1] * k2 + t * (i ? -0.05 : 0.07),
        r.tilt[2] * k2,
      );
      g.scale.setScalar(0.85 + 0.15 * k2);
    });

    // light comes up
    const lift = step(t, 1.2, 2.2) * light;
    slitUniforms.uIntensity.value = 0.3 + 0.7 * lift;
    horizonUniforms.uIntensity.value = 0.35 + 0.65 * lift;
    beamUniforms.forEach((u, i) => {
      u.uIntensity.value =
        step(t, 1.6 + i * 0.12, 1.8) *
        light *
        (Math.abs(beams[i].k) > 1 ? 0.6 : 1);
      u.uTime.value = t;
    });
    causticUniforms.uIntensity.value = step(t, 1.4, 2.0) * light;
    causticUniforms.uTime.value = t;

    frames.current += 1;
    // a settled (reduced motion) room renders on demand: draw a few frames so the environment and the refraction
    // buffer are both in place, then hold still
    if (!animate && frames.current < 3) state.invalidate();
    if (frames.current === 3) onReady();
    if (
      !settled.current &&
      frames.current >= 3 &&
      (!animate || clock.current >= ASSEMBLY_SECONDS)
    ) {
      settled.current = true;
      onSettled();
    }
  }, -2);

  return (
    <>
      <color attach="background" args={[STAGE]} />
      <fog attach="fog" args={[STAGE, 18, 36]} />
      <ambientLight intensity={0.35} color="#1B2F6B" />
      {/* no light from behind the room: it glared off the stage toward the camera and turned the navy olive. The gold
          on the glass and brass comes from the environment; the gold on the stage comes from the caustics. */}
      <directionalLight position={[-4, 5, 8]} intensity={0.35} color={ICE} />

      {/* light source behind the colonnade */}
      <mesh
        geometry={horizonGeo}
        material={horizonMat}
        position={[0, 2.2, -10]}
      />
      <mesh
        geometry={slitGeo}
        material={slitMat}
        position={[0, ROOM.slit.height / 2 - 0.5, ROOM.slit.z]}
      />

      {/* stage */}
      <mesh geometry={stageGeo} position={[0, -ROOM.stageHeight / 2, 0]}>
        <meshStandardMaterial
          ref={stageMat}
          color={STONE}
          roughness={0.72}
          metalness={0.08}
          envMapIntensity={0.08}
        />
      </mesh>
      <mesh
        geometry={floorGeo}
        material={causticMat}
        position={[0, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      />

      {/* Thin, bright things kept out of the refraction buffer: through the reeded arches the beams and the inlay ring
          came out as zigzag lines, and the beams are additive light, so seeing them refracted added nothing. Behind
          the glass they are simply hidden; the light reads as leaving the arches. */}
      <group ref={lightRef}>
        <mesh
          geometry={inlayGeo}
          position={[0, 0.004, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial color={GOLD} metalness={1} roughness={0.3} />
        </mesh>
        {beams.map((b, i) => (
          <mesh
            key={b.k}
            geometry={b.geo}
            material={beamMats[i]}
            renderOrder={2}
          />
        ))}
      </group>

      {/* brass armillary: in front of the colonnade, so kept out of the refraction buffer */}
      <group ref={frontRef}>
        {ROOM.rings.map((r, i) => (
          <group
            key={r.radius}
            ref={(g) => {
              ringRefs.current[i] = g;
            }}
            position={ROOM.crystal.position}
          >
            <mesh geometry={ringGeos[i]}>
              <meshStandardMaterial
                color={GOLD}
                metalness={1}
                roughness={0.28}
                envMapIntensity={1.4}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* glass: hidden from the refraction buffer, drawn over it */}
      <group ref={glassRef}>
        {arches.map((a, i) => (
          <mesh
            key={`${spec.count}-${a.index}`}
            ref={(m) => {
              archRefs.current[i] = m;
            }}
            geometry={archGeos[i]}
            position={[a.x, -(a.h + 0.15), a.z]}
            rotation={[0, -a.a, 0]}
          >
            <Glass samples={samples} reeded />
          </mesh>
        ))}
        <mesh
          ref={crystalRef}
          geometry={crystalGeo}
          position={[0, 0.25, ROOM.crystal.position[2]]}
        >
          <Glass samples={samples} reeded={false} warm />
        </mesh>
      </group>

      {/* The crystal's light. In the hero the slit stands behind the crystal and its faces bend that gold toward the
          camera; the closing scene's low camera sees navy behind it instead, and the quartz read as a flat tan
          block. A thin hot core inside it, in the refraction buffer (outside the glass group), gives every facet
          gold to carry. In the main pass the crystal's own faces cover it. */}
      {variant === "close" && (
        <mesh ref={coreRef} geometry={coreGeo} material={coreMat} />
      )}
    </>
  );
}

// ---- canvas -----------------------------------------------------------------------------------------------------------

/**
 * Compiles every material before the first frame, off the main thread where the browser allows it
 * (KHR_parallel_shader_compile), one object at a time with a yield between, so the page stays responsive. Without
 * it the first frame stalled the page for about 1.4 s on a desktop GPU under ANGLE/D3D11, and compiling the whole
 * scene in one call was still a single 0.4 s task on a throttled phone profile. three.js builds a separate program for
 * drawing into a render target (linear output) and for drawing to the screen (sRGB output): the refraction buffer
 * and the full tier's composer draw into targets, and only the lite tier draws its main pass to the screen, so each
 * needed set is compiled here.
 */
function Precompile({
  onDone,
  toScreen,
  variant,
}: {
  onDone: () => void;
  toScreen: boolean;
  variant: SceneVariant;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let live = true;
    const done = () => {
      if (!live) return;
      onDone();
      // the frame loop switches on with the next render; a settled (demand) room needs one nudge to draw
      requestAnimationFrame(() => live && invalidate());
    };
    // the clipped glass compiles as a clipped program only if local clipping is already on
    gl.localClippingEnabled = true;
    if (typeof gl.compileAsync !== "function") {
      done();
      return;
    }
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const meshes: Object3D[] = [];
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o);
    });
    const pending: Array<Promise<unknown>> = [];
    const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));
    let env: WebGLRenderTarget | null = null;
    (async () => {
      // the environment first: every lit material compiles with it in place (and would recompile without it)
      env = await bakeStudio(gl, variant, () => live);
      if (!live) {
        env?.dispose();
        env = null;
        return;
      }
      if (env) scene.environment = env.texture;
      await yieldTask();
      for (const m of meshes) {
        if (!live) return;
        // compile() picks the program variant from the current render target, synchronously, before it returns
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(target);
        pending.push(gl.compileAsync(m, camera, scene));
        gl.setRenderTarget(prev);
        await yieldTask();
        if (toScreen && live) {
          pending.push(gl.compileAsync(m, camera, scene));
          await yieldTask();
        }
      }
      await Promise.all(pending);
    })()
      .then(done, done)
      .finally(() => target.dispose());
    return () => {
      live = false;
      const e = env as WebGLRenderTarget | null;
      if (e) {
        if (scene.environment === e.texture) scene.environment = null;
        e.dispose();
      }
    };
  }, [gl, scene, camera, invalidate, onDone, toScreen, variant]);
  return null;
}

export default function ObservatoryScene({
  tier,
  variant,
  animate,
  running,
  clock,
  onReady,
  onSettled,
  onDecline,
  colonnade,
  dpr: fixedDpr,
}: ObservatorySceneProps) {
  const age = useRef(0);
  const [compiled, setCompiled] = useState(false);
  // the full tier draws through its composer from the first frame: drawing even one frame without it would compile
  // every material again for the screen (the 1.4 s stall Precompile exists to avoid)
  const [effectsOn, setEffectsOn] = useState(tier !== "full");
  const onCompiled = useCallback(() => setCompiled(true), []);
  const onEffects = useCallback(() => setEffectsOn(true), []);
  const dpr: number | [number, number] =
    fixedDpr ?? (tier === "full" ? [1, 1.75] : [1, 1.5]);
  const frameloop =
    !compiled || !effectsOn
      ? "never"
      : !animate
        ? "demand"
        : running
          ? "always"
          : "never";
  return (
    <Canvas
      frameloop={frameloop}
      dpr={dpr}
      flat
      gl={{
        // the full tier antialiases in its composer (FXAA); the lite tier has no composer, so the canvas does
        antialias: tier !== "full",
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        // the glass rises out of the floor: FLOOR_CLIP cuts away what is still below it
        gl.localClippingEnabled = true;
      }}
      camera={{ position: [0, 1.6, 14], fov: 30, near: 0.1, far: 80 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <BufferRoot
        tier={tier}
        variant={variant}
        colonnade={colonnade}
        animate={animate}
        onReady={onReady}
        onSettled={onSettled}
        clock={clock}
        age={age}
      />
      <Precompile
        onDone={onCompiled}
        toScreen={tier !== "full"}
        variant={variant}
      />
      {animate && (
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => {
            // a fresh mount's first frames are slow (shader warm-up), so each mount gets a grace period
            if (age.current > DECLINE_GRACE) onDecline();
          }}
        />
      )}
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects onMounted={onEffects} />
        </Suspense>
      )}
    </Canvas>
  );
}

/** Owns the groups the refraction pass leaves out (glass, armillary, thin light) and hands them to the room. */
function BufferRoot(
  props: Omit<RoomProps, "glassRef" | "frontRef" | "lightRef">,
) {
  const glass = useRef<Group | null>(null);
  const front = useRef<Group | null>(null);
  const light = useRef<Group | null>(null);
  const hide = useMemo(() => [glass, front, light], []);
  return (
    <RefractionBuffer hide={hide} scale={props.tier === "full" ? 0.75 : 0.5}>
      <Room {...props} glassRef={glass} frontRef={front} lightRef={light} />
    </RefractionBuffer>
  );
}
