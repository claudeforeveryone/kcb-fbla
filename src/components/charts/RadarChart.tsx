import { chartColor } from './shared';

export type RadarSeries = { name: string; values: number[]; color?: string };

/**
 * Radar (spider) chart, e.g. accuracy per topic area. `values[i]` maps to `axes[i]`, scaled to `max`.
 */
export function RadarChart({
  axes,
  series,
  title,
  max = 100,
  size = 280,
  rings = 4,
  formatValue = (v: number) => `${Math.round(v)}%`,
  className,
}: {
  axes: string[];
  series: RadarSeries[];
  title: string;
  max?: number;
  size?: number;
  rings?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const n = axes.length;
  if (n < 3)
    return (
      <div className={className} role="img" aria-label={`${title}: not enough areas`}>
        <div className="grid h-40 place-items-center rounded-none border border-dashed border-line text-sm text-muted">
          Needs at least three areas
        </div>
      </div>
    );
  const labelPad = 56;
  const cx = size / 2 + labelPad;
  const cy = size / 2 + 18;
  const R = size / 2 - 8;
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(max, v)) / max) * R;
    return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const;
  };
  const W = size + labelPad * 2;
  const H = size + 36;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[420px]" role="img" aria-label={title}>
        <title>
          {`${title}. ${series
            .map((s) => `${s.name}: ${axes.map((a, i) => `${a} ${formatValue(s.values[i] ?? 0)}`).join(', ')}`)
            .join('; ')}`}
        </title>
        {Array.from({ length: rings }, (_, k) => {
          const f = (k + 1) / rings;
          const d = axes.map((_, i) => {
            const [x, y] = pt(i, max * f);
            return `${i ? 'L' : 'M'}${x},${y}`;
          });
          return (
            <path
              key={k}
              d={`${d.join(' ')}Z`}
              fill={k === rings - 1 ? 'var(--surface-2)' : 'none'}
              fillOpacity={0.5}
              stroke="var(--line)"
            />
          );
        })}
        {axes.map((a, i) => {
          const [x, y] = pt(i, max);
          const [lx, ly] = [cx + Math.cos(ang(i)) * (R + 12), cy + Math.sin(ang(i)) * (R + 12)];
          const cos = Math.cos(ang(i));
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          const label = a.length > 18 ? `${a.slice(0, 17)}…` : a;
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />
              <text
                x={lx}
                y={ly}
                dy={Math.sin(ang(i)) > 0.3 ? '0.9em' : Math.sin(ang(i)) < -0.3 ? '-0.2em' : '0.32em'}
                textAnchor={anchor}
                className="fill-[var(--muted)] text-[11px] font-semibold"
              >
                {label}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const c = s.color ?? chartColor(si);
          const pts = axes.map((_, i) => pt(i, s.values[i] ?? 0));
          return (
            <g key={s.name}>
              <path
                d={`${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')}Z`}
                fill={c}
                fillOpacity={0.18}
                stroke={c}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill={c}>
                  <title>{`${axes[i]}: ${formatValue(s.values[i] ?? 0)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="size-2.5" style={{ background: s.color ?? chartColor(i) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
