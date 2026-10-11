// The Leadership Observatory: reeded glass arches rise out of a navy stage, a gold slit of light behind them, light
// through the glass falling on the stage, a quartz crystal held by brass armillary rings. Loaded as its own chunk
// after first paint (see ObservatoryStage). Nothing is fetched: the environment is built from Lightformers and every
// shape and light pattern is procedural.
//
// Refraction: drei's MeshTransmissionMaterial normally renders the whole scene once per glass material. Here the
// scene without its glass is rendered once per frame into one shared buffer, and every glass mesh reads it.
import {
  createContext,
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
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
  PerformanceMonitor,
  useFBO,
} from "@react-three/drei";
import { Bloom, EffectComposer, SMAA } from "@react-three/postprocessing";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  HalfFloatType,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector4,
  WebGLRenderTarget,
  type Material,
  type PerspectiveCamera,
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
  causticFragment,
  fluteFragmentBody,
  fluteFragmentHead,
  fluteVertexBody,
  fluteVertexHead,
  horizonFragment,
  passVertex,
  slitFragment,
} from "./shaders";

export type SceneTier = "full" | "lite";
export type SceneVariant = "hero" | "close";

export type ObservatorySceneProps = {
  tier: SceneTier;
  variant: SceneVariant;
  /** false under reduced motion: the settled room is drawn once and holds still */
  animate: boolean;
  /** false while the canvas is off-screen or the tab is hidden */
  running: boolean;
  /** the first frames have been drawn (the static frame can fade out) */
  onReady: () => void;
  /** the frame rate stayed too low: step down a tier */
  onDecline: () => void;
};

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

/** Wraps drei's transmission shader so the arch's normal is tilted across its width (fluted glass). */
function applyFlutes(mat: PatchableMaterial, freq: number, amp: number) {
  if (mat.userData.fluted) return;
  const base = mat.onBeforeCompile;
  const uniforms = { uFluteFreq: { value: freq }, uFluteAmp: { value: amp } };
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
      shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${fluteFragmentBody}`,
      );
  };
  mat.customProgramCacheKey = () => "obs-reeded-glass";
  mat.userData.fluted = true;
  mat.needsUpdate = true;
}

type GlassLook = { samples: number; reeded: boolean; warm?: boolean };

function Glass({ samples, reeded, warm }: GlassLook) {
  const buffer = useContext(BufferContext);
  const ref = useRef<PatchableMaterial | null>(null);
  useLayoutEffect(() => {
    if (reeded && ref.current)
      applyFlutes(ref.current, (2 * Math.PI * FLUTES) / ROOM.arch.width, 0.42);
  }, [reeded, samples]);
  return (
    <MeshTransmissionMaterial
      ref={ref as never}
      buffer={buffer ?? undefined}
      resolution={2}
      samples={samples}
      transmission={1}
      thickness={warm ? 1.8 : 1.1}
      roughness={warm ? 0.02 : 0.06}
      ior={warm ? 2.0 : 1.48}
      chromaticAberration={warm ? 0.14 : 0.06}
      anisotropicBlur={0.12}
      distortion={warm ? 0.05 : 0.12}
      distortionScale={0.35}
      temporalDistortion={warm ? 0 : 0.04}
      clearcoat={1}
      clearcoatRoughness={0.05}
      specularIntensity={1}
      envMapIntensity={warm ? 1.8 : 1.4}
      color={warm ? "#FFFFFF" : "#F4F7FF"}
      attenuationColor={warm ? GOLD_SOFT : ICE}
      attenuationDistance={warm ? 3.6 : 4}
      flatShading={warm}
    />
  );
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
  return g;
}

// ---- the room -------------------------------------------------------------------------------------------------------

type RoomProps = {
  tier: SceneTier;
  variant: SceneVariant;
  animate: boolean;
  onReady: () => void;
  clock: MutableRefObject<number>;
  glassRef: MutableRefObject<Group | null>;
  frontRef: MutableRefObject<Group | null>;
};

function Room({
  tier,
  variant,
  animate,
  onReady,
  clock,
  glassRef,
  frontRef,
}: RoomProps) {
  const spec: ColonnadeSpec = tier === "full" ? COLONNADE_FULL : COLONNADE_LITE;
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

  // geometry
  const archGeos = useMemo(
    () => arches.map((a) => archGeometry(a.h)),
    [arches],
  );
  const crystalGeo = useMemo(() => crystalGeometry(), []);
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
            vertexShader: passVertex,
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
        stageGeo,
        inlayGeo,
        floorGeo,
        slitGeo,
        horizonGeo,
        ...ringGeos,
      ].forEach((g) => g.dispose());
    },
    [crystalGeo, stageGeo, inlayGeo, floorGeo, slitGeo, horizonGeo, ringGeos],
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

    // three.js ignores envMapIntensity for materials lit by scene.environment alone (it uses the scene's intensity),
    // and at full strength the gold Lightformer glared off the stage and turned it olive. Handing the stage the
    // environment as its own map makes its low intensity apply.
    const sm = stageMat.current;
    const env = state.scene.environment;
    if (sm && env && sm.envMap !== env) {
      sm.envMap = env;
      sm.needsUpdate = true;
    }

    frames.current += 1;
    // a settled (reduced motion) room renders on demand: draw a few frames so the environment and the refraction
    // buffer are both in place, then hold still
    if (!animate && frames.current < 3) state.invalidate();
    if (frames.current === 3) onReady();
  }, -2);

  return (
    <>
      <color attach="background" args={[STAGE]} />
      <fog attach="fog" args={[STAGE, 18, 36]} />
      <ambientLight intensity={0.35} color="#1B2F6B" />
      {/* no light from behind the room: it glared off the stage toward the camera and turned the navy olive. The gold
          on the glass and brass comes from the environment; the gold on the stage comes from the caustics. */}
      <directionalLight position={[-4, 5, 8]} intensity={0.35} color={ICE} />

      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          color={GOLD_SOFT}
          position={[0, 2.5, -8]}
          scale={[2.2, 10, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color={ICE}
          position={[-5, 6, 6]}
          scale={[6, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.5}
          color="#3F6FB3"
          position={[6, 1, 4]}
          scale={[4, 4, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.5}
          color={GOLD_HOT}
          position={[0, 7, 2]}
          scale={2}
        />
      </Environment>

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
        geometry={inlayGeo}
        position={[0, 0.004, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.3} />
      </mesh>
      <mesh
        geometry={floorGeo}
        material={causticMat}
        position={[0, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      />

      {/* light shafts */}
      {beams.map((b, i) => (
        <mesh
          key={b.k}
          geometry={b.geo}
          material={beamMats[i]}
          renderOrder={2}
        />
      ))}

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
}: {
  onDone: () => void;
  toScreen: boolean;
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
    (async () => {
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
    };
  }, [gl, scene, camera, invalidate, onDone, toScreen]);
  return null;
}

export default function ObservatoryScene({
  tier,
  variant,
  animate,
  running,
  onReady,
  onDecline,
}: ObservatorySceneProps) {
  const clock = useRef(0);
  const [compiled, setCompiled] = useState(false);
  const onCompiled = useMemo(() => () => setCompiled(true), []);
  const dpr: [number, number] = tier === "full" ? [1, 1.75] : [1, 1.5];
  const frameloop = !compiled
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
        // the full tier antialiases in the composer (SMAA, below); the lite tier has no composer, so the canvas does
        antialias: tier !== "full",
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      camera={{ position: [0, 1.6, 14], fov: 30, near: 0.1, far: 80 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <BufferRoot
        tier={tier}
        variant={variant}
        animate={animate}
        onReady={onReady}
        clock={clock}
      />
      <Precompile onDone={onCompiled} toScreen={tier !== "full"} />
      {animate && (
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => {
            if (clock.current > 3) onDecline();
          }}
        />
      )}
      {tier === "full" && (
        // MSAA on the composer target rendered black under ANGLE/D3D11 in testing, so edges are smoothed with SMAA
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {/* a tight bloom: the default mipmap radius spread the slit's gold over the whole stage */}
          <Bloom
            intensity={0.5}
            luminanceThreshold={0.78}
            luminanceSmoothing={0.2}
            mipmapBlur
            radius={0.5}
            levels={6}
          />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/** Owns the glass and front groups so the refraction pass can hide them and the room can fill them. */
function BufferRoot(props: Omit<RoomProps, "glassRef" | "frontRef">) {
  const glass = useRef<Group | null>(null);
  const front = useRef<Group | null>(null);
  const hide = useMemo(() => [glass, front], []);
  return (
    <RefractionBuffer hide={hide} scale={props.tier === "full" ? 0.75 : 0.5}>
      <Room {...props} glassRef={glass} frontRef={front} />
    </RefractionBuffer>
  );
}
