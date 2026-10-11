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
