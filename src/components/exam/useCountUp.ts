import { useEffect, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from `from` to `to` (ease-out cubic). Jumps straight there with reduced motion. */
export function useCountUp(to: number, { from = 0, duration = 1100, delay = 0, enabled = true } = {}) {
  const [v, setV] = useState(enabled && !reduced() ? from : to);
  useEffect(() => {
    if (!enabled || reduced()) {
      setV(to);
      return;
    }
    let raf = 0;
    let start = 0;
    const t = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - p, 3);
        setV(from + (to - from) * e);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [to, from, duration, delay, enabled]);
  return v;
}
