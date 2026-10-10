import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null ? "—" : `${(x * 100).toFixed(digits)}%`;
export const int = (n: number) => Math.round(n).toLocaleString("en-CA");
export function dur(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
export function secs(ms: number) {
  const s = ms / 1000;
  return s < 60
    ? `${s.toFixed(1)}s`
    : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}
export function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const signed = (n: number) =>
  n > 0 ? `+${int(n)}` : n < 0 ? `−${int(-n)}` : "±0";
export const initial = (name: string) => (name.trim()[0] || "?").toUpperCase();
export function since(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function Page({
  title,
  sub,
  actions,
  children,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-10">
      {title && (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
          <div>
            <h1 className="display text-4xl md:text-5xl">{title}</h1>
            {sub && <p className="mt-2 text-ink-2">{sub}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </div>
  );
}

export function Bar({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "gold";
}) {
  const w = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <span
        style={{
          width: w,
          ...(tone === "gold" ? { background: "var(--gold)" } : {}),
        }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  to,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  to?: string;
  action?: string;
}) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="display num mt-2 text-4xl">{value}</div>
      {sub && <div className="mt-1 text-sm text-ink-2">{sub}</div>}
      {to && action && (
        <div className="mt-2 text-sm font-semibold text-cobalt underline underline-offset-4">
          {action}
        </div>
      )}
    </>
  );
  const cls = "block h-full bg-card p-4 md:p-5";
  return to ? (
    <Link to={to} className={cls + " transition-colors hover:bg-band"}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel px-5 py-8 text-center">
      <p className="display text-2xl">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-ink-2">{children}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="px-4 py-16 text-center text-ink-2" role="status">
      {label}…
    </div>
  );
}

export function Avatar({
  name,
  size = 40,
  you,
}: {
  name: string;
  size?: number;
  you?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={
        "display inline-flex shrink-0 items-center justify-center " +
        (you ? "bg-gold text-on-gold" : "bg-field text-on-field")
      }
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {initial(name)}
    </span>
  );
}
