// The FBLA Glass in three.js: a bevelled crystal award with a pointed top (the shape FBLA's NLC crystals use),
// frosted engraving inside, on a navy base with a brushed-gold plate. Loaded only when the Board is open.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type GlassText = { name: string; line: string; year: string };

function engravingTexture(t: GlassText) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1536;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.textAlign = "center";
  const font = (w: number, px: number) =>
    `${w} ${px}px "Barlow Condensed", "Barlow", sans-serif`;
  // a small triangle-and-bars mark, not the FBLA logo
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(512, 300);
  g.lineTo(612, 470);
  g.lineTo(412, 470);
  g.closePath();
  g.stroke();
  g.font = font(700, 120);
  g.fillText("KCB FBLA", 512, 640);
  g.fillRect(332, 690, 360, 6);
  g.font = font(600, 64);
  g.fillText("CHAPTER LEADER", 512, 800);
  let size = 150;
  g.font = font(700, size);
  while (g.measureText(t.name.toUpperCase()).width > 820 && size > 60) {
    size -= 6;
    g.font = font(700, size);
  }
  g.fillText(t.name.toUpperCase(), 512, 980);
  g.font = font(500, 60);
  g.fillText(t.line, 512, 1100);
  g.fillRect(432, 1160, 160, 4);
  g.font = font(500, 52);
  g.fillText(t.year, 512, 1250);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function plateTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, "#c88f12");
  grad.addColorStop(0.5, "#f6cd62");
  grad.addColorStop(1, "#c88f12");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 160);
  for (let x = 0; x < 1024; x += 3) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    g.fillRect(x, 0, 1, 160);
  }
  g.fillStyle = "#0b2545";
  g.textAlign = "center";
  g.font = '700 84px "Barlow Condensed", "Barlow", sans-serif';
  g.fillText("FIRST PLACE", 512, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mountGlass(
  host: HTMLElement,
  text: GlassText,
  reduced: boolean,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.55, 9.2);
  camera.lookAt(0, 1.4, 0);

  const award = new THREE.Group();
  scene.add(award);

  // crystal: 1.7 wide, shoulders at 2.6, point at 3.3
  const shape = new THREE.Shape();
  shape.moveTo(-0.85, 0);
  shape.lineTo(0.85, 0);
  shape.lineTo(0.85, 2.6);
  shape.lineTo(0, 3.3);
  shape.lineTo(-0.85, 2.6);
  shape.closePath();
  const depth = 0.42;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 4,
  });
  geo.translate(0, 0, -depth / 2);
  const crystal = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.9,
      ior: 1.52,
      attenuationColor: new THREE.Color("#cfe0ff"),
      attenuationDistance: 2.2,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      specularIntensity: 1,
      envMapIntensity: 1.4,
    }),
  );
  crystal.position.y = 0.55;
  award.add(crystal);

  const engraveTex = engravingTexture(text);
  const engraving = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 2.04),
    new THREE.MeshBasicMaterial({
      map: engraveTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  engraving.position.set(0, 0.55 + 1.5, 0);
  award.add(engraving);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.55, 1.0),
    new THREE.MeshStandardMaterial({
      color: "#0b2545",
      metalness: 0.35,
      roughness: 0.28,
    }),
  );
  base.position.y = 0.275;
  award.add(base);
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.06, 0.82),
    new THREE.MeshStandardMaterial({
      color: "#f0b323",
      metalness: 1,
      roughness: 0.3,
    }),
  );
  lip.position.y = 0.58;
  award.add(lip);
  const plateTex = plateTexture();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.234),
    new THREE.MeshStandardMaterial({
      map: plateTex,
      metalness: 0.9,
      roughness: 0.32,
    }),
  );
  plate.position.set(0, 0.28, 0.501);
  award.add(plate);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#9cc0ff", 1.6);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const size = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  let tx = 0,
    ty = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 0.15;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", () => {
    tx = 0;
    ty = 0;
  });

  let visible = true,
    raf = 0;
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) loop();
  });
  io.observe(host);
  const clockStart = performance.now();
  let yaw = 0.35,
    pitch = 0;
  function frame() {
    const t = (performance.now() - clockStart) / 1000;
    const target = reduced ? 0.35 : Math.sin(t * 0.35) * 0.45 + tx;
    yaw += (target - yaw) * 0.05;
    pitch += (ty - pitch) * 0.05;
    award.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!visible || document.hidden) return;
      frame();
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    tick();
  }
  const onVis = () => {
    if (!document.hidden) loop();
  };
  document.addEventListener("visibilitychange", onVis);
  loop();
  if (reduced) {
    for (let i = 0; i < 3; i++) frame();
  }

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    engraveTex.dispose();
    plateTex.dispose();
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// a real GPU, not a software rasterizer (school VDI), where one transmission frame takes most of a second
export function gpuOK() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(
      gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "",
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(
      r,
    );
  } catch {
    return false;
  }
}
