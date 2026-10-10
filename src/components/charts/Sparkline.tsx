
/** Tiny trend line for stat tiles and table rows. */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  color,
  area = true,
  title = 'Trend',
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Defaults to green when the trend is up, red when down. */
  color?: string;
  area?: boolean;
  title?: string;
  className?: string;
}) {
  if (values.length < 2)
    return <svg width={width} height={height} className={className} role="img" aria-label={`${title}: not enough data`} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const p = 2;
  const pts = values.map((v, i) => [
    p + (i / (values.length - 1)) * (width - p * 2),
    p + (1 - (v - min) / span) * (height - p * 2),
  ]);
  const c = color ?? (values[values.length - 1] >= values[0] ? 'var(--success)' : 'var(--red)');
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`${title}: from ${values[0]} to ${values[values.length - 1]}`}
    >
      {area && <path d={`${line} L${lx},${height} L${pts[0][0]},${height}Z`} fill={c} fillOpacity={0.1} />}
      <path d={line} fill="none" stroke={c} strokeWidth={1.75} strokeLinejoin="miter" strokeLinecap="butt" />
      <circle cx={lx} cy={ly} r={2.5} fill={c} />
    </svg>
  );
}
