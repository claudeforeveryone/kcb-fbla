import type { Rank } from "../lib/score";

// One emblem per rank: the outline gains sides as you climb (square, pentagon, hexagon, ... star), filled in the
// rank's metal, with one to three bars for the tier. Geometry, not illustration.
const LOOK: Record<
  Rank,
  { sides: number; fill: string; edge: string; star?: boolean }
> = {
  Iron: { sides: 4, fill: "#6b7280", edge: "#3f4651" },
  Bronze: { sides: 5, fill: "#b2723a", edge: "#7a4a20" },
  Silver: { sides: 6, fill: "#b9c2cf", edge: "#7d8899" },
  Gold: { sides: 6, fill: "#f0b323", edge: "#a87700" },
  Platinum: { sides: 7, fill: "#9fd3d1", edge: "#4f8f8c" },
  Diamond: { sides: 4, fill: "#8ec5ff", edge: "#2f6fb5" },
  Emerald: { sides: 8, fill: "#3fbf7f", edge: "#1d7a4c" },
  "Goatatron 3000": { sides: 10, fill: "#c084fc", edge: "#7c3aed", star: true },
  "Goatatron top g": {
    sides: 12,
    fill: "#f0b323",
    edge: "#0b2545",
    star: true,
  },
};

function polygon(
  sides: number,
  r: number,
  cx: number,
  cy: number,
  star: boolean,
  rot: number,
) {
  const pts: string[] = [];
  const n = star ? sides * 2 : sides;
  for (let i = 0; i < n; i++) {
    const rr = star && i % 2 ? r * 0.62 : r;
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(
      `${(cx + rr * Math.sin(a)).toFixed(2)},${(cy - rr * Math.cos(a)).toFixed(2)}`,
    );
  }
  return pts.join(" ");
}

export function RankBadge({
  rank,
  level,
  size = 72,
}: {
  rank: Rank;
  level: 1 | 2 | 3;
  size?: number;
}) {
  const l = LOOK[rank];
  const rot = rank === "Diamond" ? 0 : l.sides === 4 ? Math.PI / 4 : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${rank} ${"I".repeat(level)} emblem`}
    >
      <polygon
        points={polygon(l.sides, 46, 50, 50, !!l.star, rot)}
        fill={l.edge}
      />
      <polygon
        points={polygon(l.sides, 38, 50, 50, !!l.star, rot)}
        fill={l.fill}
      />
      <polygon
        points={polygon(l.sides, 38, 50, 50, !!l.star, rot)}
        fill="url(#sheen)"
        opacity=".5"
      />
      {Array.from({ length: level }, (_, i) => (
        <rect
          key={i}
          x={34}
          y={44 + (i - (level - 1) / 2) * 9 - 2.5}
          width={32}
          height={5}
          fill={l.edge}
        />
      ))}
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
