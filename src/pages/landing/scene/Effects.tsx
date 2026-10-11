// Bloom and antialiasing for the full tier, in a chunk of their own (ObservatoryStage requests it next to the scene);
// the lite tier draws straight to the canvas and never downloads it. Built from three's own example passes: the
// postprocessing library ships whole (about 68 KB gzip) for the one bloom this room needs.
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry,
  ColorManagement,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBTransfer,
  Vector2,
  WebGLRenderTarget,
  type Material,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * OutputPass picks its shader defines on its first render, from the renderer's output colour space and tone mapping.
 * This canvas is always sRGB with no tone mapping (`flat`), so the same defines are set now and the program compiled
 * ahead is the one the first frame uses. Its two bookkeeping fields are set so render() does not reset them.
 */
function primeOutputPass(pass: OutputPass, gl: WebGLRenderer) {
  if (gl.toneMapping !== NoToneMapping) return;
  const p = pass as unknown as {
    _outputColorSpace: string | null;
    _toneMapping: number | null;
  };
  p._outputColorSpace = gl.outputColorSpace;
  p._toneMapping = gl.toneMapping;
  pass.material.defines =
    ColorManagement.getTransfer(gl.outputColorSpace) === SRGBTransfer
      ? { SRGB_TRANSFER: "" }
      : {};
  pass.material.needsUpdate = true;
}

/**
 * Compiles every pass's materials with compileAsync (off the main thread where KHR_parallel_shader_compile exists),
 * one per task: the bloom's high-pass, five blur kernels, composite and blend, the output pass and FXAA. Drawn for
 * the first time inside the first frame, they used to compile there, synchronously. Every pass draws into a half-float
 * target except the last, which draws to the canvas. The quad has exactly the attributes of three's full-screen
 * triangle (position and uv): programs are keyed on the geometry's attributes too, and a plane's normals would compile
 * a sibling program the passes never use.
 */
async function compilePasses(gl: WebGLRenderer, composer: EffectComposer) {
  if (typeof gl.compileAsync !== "function") return;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new BufferGeometry();
  quad.setAttribute(
    "position",
    new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3),
  );
  quad.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const scene = new Scene();
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const last = composer.passes[composer.passes.length - 1];
  const pending: Array<Promise<unknown>> = [];
  try {
    for (const pass of composer.passes) {
      for (const value of Object.values(pass)) {
        for (const m of Array.isArray(value) ? value : [value]) {
          if (!(m as Material | null)?.isMaterial) continue;
          const prev = gl.getRenderTarget();
          gl.setRenderTarget(pass === last ? null : target);
          pending.push(gl.compileAsync(new Mesh(quad, m as Material), camera, scene));
          gl.setRenderTarget(prev);
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
    await Promise.all(pending);
  } finally {
    quad.dispose();
    target.dispose();
  }
}

export default function Effects({ onMounted }: { onMounted: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const composer = useMemo(() => {
    // The scene renders linear into a half-float target, bloom adds the slit's glow, the output pass encodes to sRGB,
    // and FXAA smooths the edges last (it reads perceptual luma). The canvas's own antialiasing does not reach a render
    // target, and an MSAA target rendered black under ANGLE/D3D11 in testing (here and with postprocessing before).
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    // tight and restrained: only the slit, the crystal's core and the hottest caustics cross the threshold
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.2, 0.2, 0.82);
    // a soft knee at the threshold (the typings only say `object`)
    (
      bloom.highPassUniforms as Record<string, { value: number }>
    ).smoothWidth.value = 0.2;
    c.addPass(bloom);
    const output = new OutputPass();
    primeOutputPass(output, gl);
    c.addPass(output);
    c.addPass(new FXAAPass());
    return c;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size.width, size.height, dpr]);

  useEffect(
    () => () => {
      composer.passes.forEach((p) => p.dispose());
      composer.dispose();
    },
    [composer],
  );

  // the composer is in place and its shaders are linked: the room may start drawing (through it, from the first frame)
  useEffect(() => {
    let live = true;
    const ready = () => {
      if (live) onMounted();
    };
    compilePasses(gl, composer).then(ready, ready);
    return () => {
      live = false;
    };
  }, [gl, composer, onMounted]);

  // a positive priority takes over the frame from R3F's own render
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
