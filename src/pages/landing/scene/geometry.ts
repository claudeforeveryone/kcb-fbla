// Procedural geometry for the observatory room. Nothing is downloaded: every shape is built here.
import {
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
} from "three";
import { ROOM } from "../roomLayout";

/** A glass arch: a rectangle with a semicircular head, extruded and bevelled, front face toward +Z, base at Y = 0. */
export function archGeometry(height: number): BufferGeometry {
  const { width, depth, bevel } = ROOM.arch;
  const r = width / 2 - bevel;
  const h = height - bevel;
  const s = new Shape();
  s.moveTo(-r, bevel);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, bevel);
  s.lineTo(-r, bevel);
  const g = new ExtrudeGeometry(s, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 36,
    steps: 1,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** A quartz point: a hexagonal prism with a pyramid at each end, centred on the origin. */
export function crystalGeometry(): BufferGeometry {
  const { radius, height, tip } = ROOM.crystal;
  const half = height / 2;
  const profile = [
    new Vector2(0, -half - tip),
    new Vector2(radius, -half),
    new Vector2(radius, half),
    new Vector2(0, half + tip),
  ];
  const g = new LatheGeometry(profile, 6);
  g.computeVertexNormals();
  return g;
}
