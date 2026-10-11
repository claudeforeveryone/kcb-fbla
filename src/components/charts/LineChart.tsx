import { useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { chartColor, fmtNum, niceTicks, toX, useWidth } from './shared';

/**
 * `gap`: the stretch from the previous point crosses values that are not shown (hidden for privacy). It is drawn
 * dashed with no area under it, so it never reads as a known climb.
 */
export type LinePoint = { x: number | string | Date; y: number; gap?: boolean };
type Pt = { x: number; y: number; gap: boolean };

/** Splits a series into runs of known values; a point marked `gap` starts a new run. */
function runsOf(pts: Pt[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  pts.forEach((p, i) => {
    if (i && p.gap) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  });
  if (cur.length) out.push(cur);
  return out;
}
export type LineSeries = { name: string; data: LinePoint[]; color?: string };

const shortDate = (n: number) => new Date(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Responsive multi-series line chart with gridlines, an area under the first series and a hover crosshair.
 * x can be numbers, Dates or ISO date strings (date axes are labelled "Oct 3").
 */
export function LineChart({
  series,
  title,
  height = 220,
  formatY = fmtNum,
  formatX,
  area = true,
  dots,
  yMin,
  yMax,
  emptyLabel = 'No data yet',
  className,
}: {
  series: LineSeries[];
  /** Accessible name. */
  title: string;
  height?: number;
  formatY?: (v: number) => string;
  formatX?: (x: number) => string;
  area?: boolean;
  dots?: boolean;
  yMin?: number;
  yMax?: number;
  emptyLabel?: ReactNode;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const prepared = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        color: s.color ?? chartColor(i),
        pts: s.data
          .map((d, j): Pt => {
            const x = toX(d.x);
            return { x: isNaN(x) ? j : x, y: d.y, gap: !!d.gap };
          })
          .sort((a, b) => a.x - b.x),
      })),
    [series],
  );
  const all = prepared.flatMap((s) => s.pts);
  const isDate = series.some((s) => s.data.some((d) => typeof d.x !== 'number'));
  const fx = formatX ?? (isDate ? shortDate : (n: number) => fmtNum(n));

  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const W = Math.max(120, width);
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  if (!all.length) {
    return (
      <div ref={ref} className={className} style={{ height }} role="img" aria-label={`${title}: no data`}>
        <div className="grid h-full place-items-center rounded-[4px] border border-dashed border-line text-sm text-muted">
          {emptyLabel}
        </div>
      </div>
    );
  }

  const xs = all.map((p) => p.x);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x0 === x1) {
    // one point: widen by a day for timestamps, by 1 otherwise
    const span = x0 > 1e11 ? 86_400_000 : 1;
    x0 -= span;
    x1 += span;
  }
  const ys = all.map((p) => p.y);
  const lo = yMin ?? Math.min(...ys);
  let hi = yMax ?? Math.max(...ys);
  // A flat series (e.g. Elo sitting at the 0 floor) pads upward only, so the axis never suggests values below it.
  if (hi <= lo) hi = lo + Math.max(10, Math.abs(lo) * 0.2);
  const ticks = niceTicks(lo, hi, 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * iw;
  const sy = (y: number) => pad.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  // x labels: up to ~6 evenly spaced across the domain
  const nX = Math.max(2, Math.min(6, Math.floor(iw / 90)));
  let xTicks = Array.from({ length: nX }, (_, i) => x0 + ((x1 - x0) * i) / (nX - 1));
  if (isDate && !formatX) {
    // date axes: ticks on local midnights, a whole number of days apart, so labels sit under their day
    const DAY = 86_400_000;
    const stepDays = Math.max(1, Math.ceil((x1 - x0) / DAY / (nX - 1)));
    const first = new Date(x0);
    first.setHours(0, 0, 0, 0);
    if (first.getTime() < x0) first.setDate(first.getDate() + 1);
    const days: number[] = [];
    for (const d = first; d.getTime() <= x1; d.setDate(d.getDate() + stepDays)) days.push(d.getTime());
    if (days.length >= 2) xTicks = days;
  }

  const primary = prepared[0];
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / (rect.width || 1)) * W;
    const target = x0 + ((px - pad.l) / iw) * (x1 - x0);
    let best = 0;
    primary.pts.forEach((p, i) => {
      if (Math.abs(p.x - target) < Math.abs(primary.pts[best].x - target)) best = i;
    });
    setHover(best);
  };

  const hp = hover != null ? primary.pts[hover] : null;
  const last = primary.pts[primary.pts.length - 1];

  return (
    <div ref={ref} className={`w-full min-w-0 ${className ?? ""}`}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. Latest ${formatY(last.y)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-pan-y select-none overflow-visible"
      >
        <title>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeDasharray={t === y0 ? undefined : '3 4'} />
            <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="tabular fill-[var(--muted)] text-[11px]">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) =>
          // skip a label that repeats its neighbour (short date spans)
          i > 0 && fx(t) === fx(xTicks[i - 1]) ? null : (
          <text
            key={i}
            x={sx(t)}
            y={H - 6}
            textAnchor={sx(t) - pad.l < 24 ? 'start' : W - pad.r - sx(t) < 24 ? 'end' : 'middle'}
            className="tabular fill-[var(--muted)] text-[11px]"
          >
            {fx(t)}
          </text>
          ),
        )}
        {area &&
          runsOf(primary.pts)
            .filter((run) => run.length > 1)
            .map((run, i) => (
              <path
                key={i}
                d={`M${sx(run[0].x)},${sy(y0)} ${run.map((p) => `L${sx(p.x)},${sy(p.y)}`).join(' ')} L${sx(run[run.length - 1].x)},${sy(y0)}Z`}
                fill={primary.color}
                fillOpacity={0.08}
              />
            ))}
        {prepared.map((s) => {
          const runs = runsOf(s.pts);
          const gaps = s.pts.flatMap((p, i) => (i && p.gap ? [`M${sx(s.pts[i - 1].x)},${sy(s.pts[i - 1].y)} L${sx(p.x)},${sy(p.y)}`] : []));
          return (
            <g key={s.name}>
              <path
                d={runs.map((run) => run.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {gaps.length > 0 && <path d={gaps.join(' ')} fill="none" stroke={s.color} strokeWidth={1.75} strokeDasharray="4 4" />}
              {/* Dots on every point of a short series, and always on a known value that stands alone between gaps. */}
              {runs.flatMap((run) =>
                dots || run.length === 1
                  ? run.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--surface)" stroke={s.color} strokeWidth={2} />)
                  : [],
              )}
            </g>
          );
        })}
        {hp && (
          <g pointerEvents="none">
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" />
            {prepared.map((s) => {
              const p = s.pts.reduce((b, q) => (Math.abs(q.x - hp.x) < Math.abs(b.x - hp.x) ? q : b), s.pts[0]);
              return <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })}
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none relative h-0">
          <div
            className="absolute bottom-[calc(100%+var(--h))] z-10 -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink shadow-pop"
            style={{ left: Math.min(W - 60, Math.max(60, sx(hp.x))), ['--h' as string]: `${H - sy(hp.y) + 12}px` }}
          >
            <div className="text-muted">{fx(hp.x)}</div>
            {prepared.map((s) => {
              const p = s.pts.reduce((b, q) => (Math.abs(q.x - hp.x) < Math.abs(b.x - hp.x) ? q : b), s.pts[0]);
              return (
                <div key={s.name} className="tabular flex items-center gap-1.5 font-semibold">
                  <span className="size-2" style={{ background: s.color }} />
                  {prepared.length > 1 && <span className="font-normal text-muted">{s.name}</span>}
                  {formatY(p.y)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {prepared.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {prepared.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
