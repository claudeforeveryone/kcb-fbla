import { useCallback, useRef } from 'react';

/**
 * Horizontal scroll cue for tab strips and pill rows: sets `data-fade` to "start", "end" or "both" on the element
 * while there is more content off that edge, and the `.scroll-fade` rule in index.css fades that edge out with a
 * mask (no coloured gradient, so it works on any background). Attach the returned callback ref and add the
 * `scroll-fade` class to the same element.
 */
export function useScrollFade<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 2;
      const end = max - el.scrollLeft > 2;
      const fade = start && end ? 'both' : start ? 'start' : end ? 'end' : '';
      if (fade) el.dataset.fade = fade;
      else delete el.dataset.fade;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    for (const child of Array.from(el.children)) ro?.observe(child);
    cleanup.current = () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);
}

/** Width of the faded edge in `.scroll-fade` (index.css): an item under it counts as out of view. */
const FADE_PX = 40;

/**
 * Where a sideways-scrolling row should scroll so an item in it is in full view: null when it already is (or the row
 * does not scroll), else the scrollLeft that centres the item, kept within the row. `start` and `width` are the
 * item's left edge and width in the row's scroll coordinates.
 */
export function revealScrollLeft(m: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  start: number;
  width: number;
}): number | null {
  const max = m.scrollWidth - m.clientWidth;
  if (max <= 0) return null;
  const left = m.scrollLeft + (m.scrollLeft > 2 ? FADE_PX : 0);
  const right = m.scrollLeft + m.clientWidth - (max - m.scrollLeft > 2 ? FADE_PX : 0);
  if (m.start >= left && m.start + m.width <= right) return null;
  return Math.round(Math.min(max, Math.max(0, m.start - (m.clientWidth - m.width) / 2)));
}

/**
 * Scrolls `row` sideways so `item` is in full view (see revealScrollLeft). Only the row moves, never the page, so
 * it is safe on first render and after a deep link. Smooth unless `instant` or the visitor prefers reduced motion.
 */
export function revealInRow(row: HTMLElement | null | undefined, item: HTMLElement | null | undefined, instant = false) {
  if (!row || !item) return;
  const r = row.getBoundingClientRect();
  const e = item.getBoundingClientRect();
  const target = revealScrollLeft({
    scrollLeft: row.scrollLeft,
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
    start: e.left - r.left + row.scrollLeft,
    width: e.width,
  });
  if (target == null) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollTo({ left: target, behavior: instant || reduce ? 'auto' : 'smooth' });
}
