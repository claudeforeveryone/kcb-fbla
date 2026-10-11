// Bloom and antialiasing for the full tier, in a chunk of their own (ObservatoryStage requests it next to the scene);
// the lite tier draws straight to the canvas and never downloads it. Built from three's own example passes: the
// postprocessing library ships whole (about 68 KB gzip) for the one bloom this room needs.
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

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
    c.addPass(new OutputPass());
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

  // the composer is in place: the room may start drawing (through it, from the first frame)
  useEffect(() => {
    onMounted();
  }, [onMounted]);

  // a positive priority takes over the frame from R3F's own render
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
