import { useLayoutEffect, useRef, useState } from 'react';

/** Series colours: CSS variables so they follow the theme. */
export const CHART_COLORS = ['var(--blue)', 'var(--red)', 'var(--heading)', 'var(--success)', 'var(--warning)', '#7B61C9', '#0F8FA0'];
export const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

/** Measure an element's width (ResizeObserver). */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const fmtNum = (n: number) =>
  Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n * 10) / 10);

/** Turn number | Date | ISO string into an epoch number (strings that are not dates fall back to NaN). */
export function toX(x: number | string | Date): number {
  if (typeof x === 'number') return x;
  if (x instanceof Date) return x.getTime();
  // A bare 'YYYY-MM-DD' is a calendar day: read it as local midnight, not UTC (which shows as the previous day
  // anywhere west of Greenwich).
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
  if (d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getTime();
  return Date.parse(x);
}
