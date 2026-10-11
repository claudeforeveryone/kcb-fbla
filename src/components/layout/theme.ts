import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
// New key so any older saved choice ("Auto"/dark) is dropped and everyone starts on white.
const KEY = 'fblc:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage blocked */
  }
  // White by default; dark only when the member picks it in Settings.
  return 'light';
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const darkListeners = new Set<() => void>();
const subscribeDark = (cb: () => void) => {
  darkListeners.add(cb);
  return () => {
    darkListeners.delete(cb);
  };
};
const readDark = () => document.documentElement.classList.contains('dark');
// Prerendered pages are built light, so hydration starts light and switches straight after if dark is chosen.
const readDarkOnServer = () => false;

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', !!dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#050d2b' : '#001E60');
  darkListeners.forEach((l) => l());
}

const listeners = new Set<(p: ThemePref) => void>();

/** Theme preference (light / dark / follow system), persisted per browser. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const isDark = useSyncExternalStore(subscribeDark, readDark, readDarkOnServer);

  useEffect(() => {
    const on = (p: ThemePref) => setPref(p);
    listeners.add(on);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSys = () => {
      if (read() === 'system') {
        apply('system');
        on('system');
      }
    };
    mq?.addEventListener?.('change', onSys);
    return () => {
      listeners.delete(on);
      mq?.removeEventListener?.('change', onSys);
    };
  }, []);

  const setTheme = useCallback((p: ThemePref) => {
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage blocked */
    }
    apply(p);
    listeners.forEach((l) => l(p));
  }, []);

  const toggle = useCallback(() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'), [setTheme]);

  return { theme: pref, isDark, setTheme, toggle };
}
