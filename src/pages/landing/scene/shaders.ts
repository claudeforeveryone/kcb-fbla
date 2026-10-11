// GLSL for the observatory room, written for this build. Every fragment shader ends with three's colour-space
// chunk so authored colours land the same on screen as the CSS around the canvas.

export const passVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const tail = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/**
 * The gold slit behind the colonnade: a hot vertical core inside a soft halo, brightest at standing height and
 * fading toward the top, like light through an opened dome.
 */
export const slitFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-x * x * 90.0);
  float halo = exp(-x * x * 20.0);
  float v = vUv.y;
  float vertical = smoothstep(0.0, 0.06, v) * (1.0 - smoothstep(0.18, 0.72, v));
  vec3 col = (uCore * core * 1.9 + uColor * halo * 0.5) * vertical * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${tail}
}`;

/** A wide, low dawn glow behind the stage's far rim; it fades out well before the plane's edges. */
export const horizonFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float band = exp(-pow(vUv.y * 3.4, 2.0));
  float spread = exp(-pow(vWorld.x * 0.093, 2.0));
  float edge = 1.0 - smoothstep(0.3, 0.48, abs(vUv.x - 0.5));
  vec3 col = uColor * band * spread * edge * 0.55 * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${tail}
}`;

/** The beam quad's vertex stage: also passes how squarely the quad faces the camera (1 face on, 0 edge on). */
export const beamVertex = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
  gl_Position = projectionMatrix * view;
}`;

/**
 * A soft beam of light: bright at its source edge, thinning toward the floor, feathered at the sides. A beam is a flat
 * quad, so it fades as the camera comes round to its edge (the closing scene's turned camera saw a hard-edged band).
 */
export const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying float vFacing;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float side = 1.0 - smoothstep(0.15, 1.0, x);
  // visible in the air above the stage, gone before it reaches the floor (the caustics carry it from there)
  float along = smoothstep(0.3, 1.0, vUv.y) * pow(vUv.y, 1.5) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
  float breathe = 0.9 + 0.1 * sin(uTime * 0.7 + uSeed * 3.1);
  float facing = smoothstep(0.12, 0.5, vFacing);
  vec3 col = uColor * side * side * along * 0.075 * uIntensity * breathe * facing;
  gl_FragColor = vec4(col, 1.0);
  ${tail}
}`;

/**
 * Caustic light on the stage. Gold light from the slit passes through each reeded arch and lands on the floor in
 * front of it as a corridor of soft bright lines that waver and spread as they travel; the crystal gathers a small,
 * brighter pool under itself. Every line pattern is filtered by its own screen-space rate (fwidth), so far and
 * grazing parts of the floor settle to an even glow instead of shimmering into moire.
 */
export const causticFragment = /* glsl */ `
#define MAX_ARCHES 7
uniform vec4 uArches[MAX_ARCHES]; // x, z, angle, reveal (0..1)
uniform int uCount;
uniform float uTime;
uniform float uIntensity;
uniform float uArchWidth;
uniform float uLines;
uniform vec3 uColor;
uniform vec3 uWarm;
varying vec3 vWorld;

// Lines at every whole number of phase, width wide (in phase units), antialiased, fading to their mean
// brightness where they are too fine for the pixel grid.
float lines(float phase, float width) {
  // never zero: smoothstep with equal edges is undefined, and one NaN pixel would spread through the bloom
  float fw = max(fwidth(phase), 1e-4);
  float d = abs(fract(phase + 0.5) - 0.5);
  float line = 1.0 - smoothstep(width - fw, width + fw, d);
  return mix(line, width * 2.0, smoothstep(0.18, 0.45, fw));
}

float ridges(vec2 p, float t) {
  vec2 q = p;
  for (int i = 0; i < 3; i++) {
    q += 0.45 * vec2(sin(q.y * 1.9 + t * 0.55 + float(i) * 1.7), cos(q.x * 1.7 - t * 0.45));
  }
  float r = abs(sin(q.x * 1.4) * sin(q.y * 1.3 + 0.6));
  float fw = fwidth(r);
  float w = 0.07 + fw * 1.5;
  return (1.0 - smoothstep(0.0, w, r)) * (0.07 / w);
}

void main() {
  vec2 p = vWorld.xz;
  float light = 0.0;
  for (int i = 0; i < MAX_ARCHES; i++) {
    if (i >= uCount) break;
    vec4 a = uArches[i];
    vec2 dir = vec2(-sin(a.z), cos(a.z));
    vec2 perp = vec2(dir.y, -dir.x);
    vec2 rel = p - a.xy;
    float along = dot(rel, dir);
    float across = dot(rel, perp);
    float spread = 1.0 + max(along, 0.0) * 0.1;
    float halfW = uArchWidth * 0.5 * spread;
    float inside = 1.0 - smoothstep(halfW - 0.08, halfW + 0.14, abs(across));
    float reach = smoothstep(0.05, 0.4, along) * (1.0 - smoothstep(0.8, 3.4, along));
    float wobble = 0.06 * sin(along * 2.2 + uTime * 0.8 + float(i) * 2.3) + 0.025 * sin(along * 6.1 - uTime * 1.3);
    float phase = (across + wobble) / (uArchWidth * spread) * uLines + 0.5;
    float shimmer = 0.75 + 0.25 * sin(uTime * 1.1 + along * 3.0 + float(i));
    light += inside * reach * (0.012 + lines(phase, 0.11) * shimmer * 0.4) * a.w;
  }
  float r = length(p - vec2(0.0, 0.35));
  float pool = (1.0 - smoothstep(0.0, 1.45, r));
  float swirl = ridges(p * 2.2, uTime * 0.6);
  // small linear values still read strongly after the sRGB encode below, so the even glow is kept very low
  vec3 col = uColor * light * 0.5 + uWarm * pool * pool * (0.015 + swirl * 0.3);
  float edge = 1.0 - smoothstep(4.6, 5.1, length(p));
  gl_FragColor = vec4(col * uIntensity * edge, 1.0);
  ${tail}
}`;

/** Reeded glass: tilts the shading normal across the arch's width so each arch reads as fluted glass. */
export const fluteVertexHead = /* glsl */ `
varying float vFluteX;
varying float vFluteFacing;
varying vec3 vFluteTangent;
`;

export const fluteVertexBody = /* glsl */ `
vFluteX = position.x;
vFluteFacing = abs(normal.z);
vFluteTangent = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
`;

export const fluteFragmentHead = /* glsl */ `
uniform float uFluteFreq;
uniform float uFluteAmp;
uniform float uRim;
uniform vec3 uRimColor;
varying float vFluteX;
varying float vFluteFacing;
varying vec3 vFluteTangent;
`;

export const fluteFragmentBody = /* glsl */ `
{
  float fl = sin(vFluteX * uFluteFreq) * uFluteAmp * smoothstep(0.55, 0.9, vFluteFacing);
  normal = normalize(normal + vFluteTangent * fl);
}
`;

/**
 * A thin cool rim where the glass turns away from the camera (silhouettes, the arch's side faces), so each arch keeps
 * a glass edge against the navy even where little light comes through it. Added before the colour-space encode.
 */
export const glassRimBody = /* glsl */ `
{
  float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  gl_FragColor.rgb += uRimColor * pow(1.0 - facing, 3.0) * uRim;
}
`;
