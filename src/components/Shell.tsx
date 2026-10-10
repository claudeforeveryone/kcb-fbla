import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";
import {
  Trophy,
  PencilLine,
  Layers,
  UserRound,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { useStore } from "../state";

const NAV = [
  { to: "/", label: "Board", icon: Trophy, end: true },
  { to: "/play", label: "Play", icon: PencilLine },
  { to: "/vocab", label: "Vocab", icon: Layers },
  { to: "/me", label: "Me", icon: UserRound },
];

export type ThemePref = "light" | "dark" | "system";
const THEME_KEY = "kcbfbla:theme";
export const readTheme = (): ThemePref => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "system";
};
export function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    pref === "system"
      ? localStorage.removeItem(THEME_KEY)
      : localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
}

function ThemeButton({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      if (readTheme() === "system") {
        applyTheme("system");
        setDark(mq.matches);
      }
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    <button
      type="button"
      className={
        "inline-flex h-11 w-11 items-center justify-center " + className
      }
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        applyTheme(dark ? "light" : "dark");
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="group inline-flex items-baseline gap-2 no-underline"
      aria-label="KCB FBLA home"
    >
      <span
        className={
          "display text-on-field " + (compact ? "text-3xl" : "text-5xl")
        }
      >
        KCB
      </span>
      <span
        className={"display text-gold " + (compact ? "text-xl" : "text-2xl")}
        style={{ letterSpacing: ".08em" }}
      >
        FBLA
      </span>
    </Link>
  );
}

function Credit() {
  return (
    <p className="text-xs text-on-field-2 opacity-60">
      made by J <span aria-hidden>♡</span>
    </p>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { backend, note, setNote } = useStore();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-field text-on-field fixed inset-y-0 left-0 z-20 hidden w-60 flex-col justify-between overflow-y-auto md:flex">
        <div>
          <div className="px-6 pb-8 pt-7">
            <Wordmark />
          </div>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      "flex min-h-12 items-center gap-3 px-6 text-lg font-semibold transition-colors [&[aria-current=page]>svg]:text-gold " +
                      (isActive
                        ? "bg-field-2 text-on-field"
                        : "text-on-field-2 hover:bg-field-2 hover:text-on-field")
                    }
                  >
                    <n.icon size={20} aria-hidden /> {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="space-y-3 px-5 pb-6">
          <div className="flex items-center gap-1 text-on-field-2">
            <NavLink
              to="/settings"
              className="inline-flex h-11 items-center gap-2 pr-3 font-semibold hover:text-on-field"
            >
              <Settings size={18} aria-hidden /> Settings
            </NavLink>
            <ThemeButton className="ml-auto hover:text-on-field" />
          </div>
          <Credit />
        </div>
      </aside>

      <header className="bg-field text-on-field sticky top-0 z-20 flex h-14 items-center justify-between px-4 md:hidden">
        <Wordmark compact />
        <div className="flex items-center text-on-field-2">
          <NavLink
            to="/settings"
            className="inline-flex h-11 w-11 items-center justify-center"
            aria-label="Settings"
          >
            <Settings size={20} />
          </NavLink>
          <ThemeButton />
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 md:pl-60">
        {backend?.kind === "local" && (
          <div className="border-b border-rule bg-band px-4 py-2 text-sm text-ink-2 md:px-8">
            On-device mode: the chapter database isn't connected yet, so your
            progress saves to this browser only.
          </div>
        )}
        {note && (
          <div
            className="flex items-center justify-between gap-3 border-b border-rule bg-ok-band px-4 py-2 text-sm md:px-8"
            role="status"
          >
            <span>{note}</span>
            <button
              className="font-semibold underline"
              onClick={() => setNote(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        {children}
        <div className="bg-field px-4 py-4 md:hidden">
          <Credit />
        </div>
      </main>

      <nav
        aria-label="Main"
        className="bg-field fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-field-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              "flex h-16 flex-col items-center justify-center gap-1 border-t-4 text-xs font-semibold " +
              (isActive
                ? "border-gold text-on-field"
                : "border-transparent text-on-field-2")
            }
          >
            <n.icon size={22} aria-hidden /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
