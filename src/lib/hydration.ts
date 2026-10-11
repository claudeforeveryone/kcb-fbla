import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

/**
 * Values that differ between the build-time prerender and the browser. Hydration has to reproduce the prerendered
 * HTML exactly (React 19 does not patch a mismatched attribute, and a mismatched text node makes it throw away and
 * re-render the whole page), so these hooks give the server value during the prerender and during hydration, then
 * switch to the browser value straight after. A page rendered fresh in the browser gets the browser value at once.
 */

/** Calendar year of the build, injected by vite.config.ts (`define`). The prerendered HTML shows this one. */
export const BUILD_YEAR: number = __BUILD_YEAR__;

const subscribeNever = () => () => {};

/** False in the prerender and while hydrating, true afterwards. Gate anything that reads the URL query on it. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/** The visitor's current year, or the build year in the prerender and while hydrating. */
export function useCurrentYear(): number {
  return useSyncExternalStore(
    subscribeNever,
    () => new Date().getFullYear(),
    () => BUILD_YEAR,
  );
}

/**
 * Keeps what a visitor typed into a prerendered field before the app took the page over (a slow phone shows the form
 * well before its script runs). React 19 hydrates a controlled input without touching its text, but the component's
 * state still starts empty, and the next render (useHydrated() flipping, for one) writes that empty state back over
 * it. This runs in the hydration commit, before any re-render, and copies the text into state. An input rendered in
 * the browser starts empty, so there it does nothing.
 */
export function useKeepTypedValue(ref: RefObject<HTMLInputElement | null>, setValue: (value: string) => void): void {
  useLayoutEffect(() => {
    const typed = ref.current?.value;
    if (typed) setValue(typed);
    // Mount only: from then on the input is controlled and onChange keeps state in step.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The element id a URL hash points at ("#email" is "email"), or null when there is none. */
export function hashTargetId(hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Brings a section link such as /privacy#email to its section when the page mounts in the browser. The browser's own
 * jump to the anchor only works when the section is in the HTML it loaded: a prerendered page hydrated for a signed-out
 * reader. Everywhere else (a signed-in member, whose prerendered markup is hidden and replaced, or in-app navigation
 * to a lazy page) the section appears later and nothing scrolls to it. Skipped on a hydration mount, so a reader who
 * was already placed by the browser, or has scrolled on since, is not moved.
 */
export function useScrollToHash(): void {
  const hydrating = !useHydrated();
  const skip = useRef(hydrating);
  useEffect(() => {
    if (skip.current) return;
    const id = hashTargetId(window.location.hash);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
}
