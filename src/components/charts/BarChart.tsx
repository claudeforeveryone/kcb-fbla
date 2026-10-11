import { useState, type ReactNode } from 'react';
import { chartColor, fmtNum, niceTicks, useWidth } from './shared';

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
  /** Secondary text, e.g. "12 / 20". Horizontal layout only. */
  sub?: ReactNode;
  /** Mark this bar (e.g. "you"): drawn in red. */
  highlight?: boolean;
  /** The value is hidden (a group of 1-4 people): drawn as an empty dashed bar labelled "Under 5". */
  suppressed?: boolean;
};

const HIDDEN = 'Under 5';

/**
 * Bar chart. Horizontal (default) renders labelled rows that wrap well on phones; vertical renders SVG columns.
 */
export function BarChart({
  data,
  title,
  orientation = 'horizontal',
  max,
  formatValue = fmtNum,
  height = 220,
  color,
  emptyLabel = 'No data yet',
  className,
}: {
  data: BarDatum[];
  title: string;
  orientation?: 'horizontal' | 'vertical';
  max?: number;
  formatValue?: (v: number) => string;
  /** Vertical only. */
  height?: number;
  color?: string;
  emptyLabel?: ReactNode;
  className?: string;
}) {
  if (!data.length)
    return (
      <div className={className} role="img" aria-label={`${title}: no data`}>
        <div className="grid h-28 place-items-center rounded-[4px] border border-dashed border-line text-sm text-muted">{emptyLabel}</div>
      </div>
    );
  return orientation === 'horizontal' ? (
    <Horizontal data={data} title={title} max={max} formatValue={formatValue} color={color} className={className} />
  ) : (
    <Vertical data={data} title={title} max={max} formatValue={formatValue} height={height} color={color} className={className} />
  );
}

function Horizontal({
  data,
  title,
  max,
  formatValue,
  color,
  className,
}: {
  data: BarDatum[];
  title: string;
  max?: number;
  formatValue: (v: number) => string;
  color?: string;
  className?: string;
}) {
  const m = max ?? Math.max(...data.map((d) => (d.suppressed ? 0 : d.value)), 1);
  return (
    <figure className={className} aria-label={title}>
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="space-y-3">
        {data.map((d, i) => {
          const p = d.suppressed ? 0 : Math.max(0, Math.min(100, (d.value / (m || 1)) * 100));
          const c = d.highlight ? 'var(--red)' : (d.color ?? color ?? chartColor(0));
          return (
            <li key={`${d.label}-${i}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-ink">{d.label}</span>
                <span className="tabular shrink-0 text-muted">
                  {d.sub && <span className="mr-2 text-xs">{d.sub}</span>}
                  {d.suppressed ? (
                    <span className="font-semibold text-muted">{HIDDEN}</span>
                  ) : (
                    <span className="font-semibold text-heading">{formatValue(d.value)}</span>
                  )}
                </span>
              </div>
              <div className={d.suppressed ? 'h-2 border border-dashed border-line-strong' : 'h-2 overflow-hidden bg-surface-3'}>
                <div
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{ width: `${p}%`, background: c }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Vertical({
  data,
  title,
  max,
  formatValue,
  height,
  color,
  className,
}: {
  data: BarDatum[];
  title: string;
  max?: number;
  formatValue: (v: number) => string;
  height: number;
  color?: string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 8, t: 18, b: 26 };
  const W = Math.max(120, width);
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const ticks = niceTicks(0, max ?? Math.max(...data.map((d) => (d.suppressed ? 0 : d.value)), 1), 4);
  const top = ticks[ticks.length - 1] || 1;
  const band = iw / data.length;
  const bw = Math.max(4, Math.min(44, band * 0.62));
  const sy = (v: number) => pad.t + ih - (v / top) * ih;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 48)));

  return (
    <div ref={ref} className={`w-full min-w-0 ${className ?? ""}`}>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} className="block overflow-visible">
        <title>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="tabular fill-[var(--muted)] text-[11px]">
              {formatValue(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          const y = sy(d.suppressed ? 0 : Math.max(0, d.value));
          const c = d.highlight ? 'var(--red)' : (d.color ?? color ?? chartColor(0));
          const shown = d.suppressed ? HIDDEN : formatValue(d.value);
          const stub = Math.min(8, ih);
          return (
            <g
              key={`${d.label}-${i}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              opacity={hover == null || hover === i ? 1 : 0.55}
              style={{ transition: 'opacity 150ms' }}
            >
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
              {d.suppressed ? (
                <rect
                  x={cx - bw / 2 + 0.5}
                  y={pad.t + ih - stub}
                  width={Math.max(0, bw - 1)}
                  height={stub}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeDasharray="2 2"
                >
                  <title>{`${d.label}: ${HIDDEN} (hidden for privacy)`}</title>
                </rect>
              ) : (
                <rect x={cx - bw / 2} y={y} width={bw} height={Math.max(0, pad.t + ih - y)} fill={c}>
                  <title>{`${d.label}: ${shown}`}</title>
                </rect>
              )}
              {hover === i && (
                <text
                  x={cx}
                  y={(d.suppressed ? pad.t + ih - stub : y) - 6}
                  textAnchor="middle"
                  className="tabular fill-[var(--heading)] text-[11px] font-bold"
                >
                  {shown}
                </text>
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
                  {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
