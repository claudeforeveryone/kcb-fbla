import { useState, type ReactNode } from 'react';
import { chartColor } from './shared';

export type DonutSegment = { label: string; value: number; color?: string };

/** Donut with optional centre content and legend. */
export function Donut({
  segments,
  title,
  size = 160,
  thickness = 18,
  center,
  legend = true,
  formatValue = (v: number, total: number) => `${Math.round((v / (total || 1)) * 100)}%`,
  className,
}: {
  segments: DonutSegment[];
  title: string;
  size?: number;
  thickness?: number;
  center?: ReactNode;
  legend?: boolean;
  formatValue?: (v: number, total: number) => string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let acc = 0;

  return (
    <div className={`flex flex-wrap items-center gap-5 ${className ?? ''}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title} className="-rotate-90">
          <title>{`${title}: ${segments.map((s) => `${s.label} ${formatValue(s.value, total)}`).join(', ')}`}</title>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (Math.max(0, s.value) / total) * c;
              const off = acc;
              acc += len;
              if (len <= 0) return null;
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color ?? chartColor(i)}
                  strokeWidth={hover === i ? thickness + 4 : thickness}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                  strokeDashoffset={-off}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  style={{ transition: 'stroke-width 150ms ease-out' }}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {hover != null ? (
            <div>
              <div className="tabular font-display text-xl font-extrabold text-heading">
                {formatValue(segments[hover].value, total)}
              </div>
              <div className="max-w-[80%] truncate text-xs text-muted">{segments[hover].label}</div>
            </div>
          ) : (
            center
          )}
        </div>
      </div>
      {legend && (
        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {segments.map((s, i) => (
            <li
              key={s.label}
              className="flex items-center gap-2"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color ?? chartColor(i) }} />
              <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
              <span className="tabular font-semibold text-heading">{formatValue(s.value, total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
