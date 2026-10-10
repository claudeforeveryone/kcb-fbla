import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { cn } from './cn';

/** "mm:ss" (or "h:mm:ss") for a number of seconds. */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Human "3d 4h", "2h 05m", "12m" until a date. */
export function formatUntil(target: Date | string | number, now = Date.now()) {
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * Counts down to `until` (a Date/ISO/epoch ms) or for `seconds` from mount. Calls onExpire once.
 * Turns amber under `warnAt` seconds and red under `dangerAt`.
 */
export function CountdownTimer({
  until,
  seconds,
  paused,
  onExpire,
  onTick,
  warnAt = 60,
  dangerAt = 15,
  variant = 'chip',
  className,
}: {
  until?: Date | string | number;
  seconds?: number;
  paused?: boolean;
  onExpire?: () => void;
  onTick?: (secondsLeft: number) => void;
  warnAt?: number;
  dangerAt?: number;
  variant?: 'chip' | 'plain' | 'onDark';
  className?: string;
}) {
  const end = useRef<number>(0);
  const [left, setLeft] = useState(() =>
    until != null ? (new Date(until).getTime() - Date.now()) / 1000 : (seconds ?? 0),
  );
  const fired = useRef(false);
  const cb = useRef({ onExpire, onTick });
  cb.current = { onExpire, onTick };

  // (Re)anchor the end time when the target changes or the timer resumes.
  useEffect(() => {
    if (until != null) end.current = new Date(until).getTime();
    else end.current = Date.now() + left * 1000;
    fired.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until, seconds, paused]);

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      const l = Math.max(0, (end.current - Date.now()) / 1000);
      setLeft(l);
      cb.current.onTick?.(Math.ceil(l));
      if (l <= 0 && !fired.current) {
        fired.current = true;
        cb.current.onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, until, seconds]);

  const state = left <= dangerAt ? 'danger' : left <= warnAt ? 'warn' : 'ok';
  const text = formatClock(left);

  if (variant === 'plain')
    return (
      <span
        className={cn(
          'tabular font-display font-bold',
          state === 'danger' ? 'text-danger' : state === 'warn' ? 'text-warning' : 'text-heading',
          className,
        )}
        role="timer"
        aria-live="off"
      >
        {text}
      </span>
    );

  return (
    <span
      role="timer"
      aria-label={`${text} remaining`}
      className={cn(
        'tabular inline-flex h-9 items-center gap-1.5 rounded-[2px] px-3 font-display text-[0.9375rem] font-bold transition-colors duration-200',
        variant === 'onDark'
          ? state === 'danger'
            ? 'bg-red text-white'
            : state === 'warn'
              ? 'bg-warning text-white'
              : 'bg-white/12 text-white ring-1 ring-inset ring-white/15'
          : state === 'danger'
            ? 'bg-red text-white'
            : state === 'warn'
              ? 'bg-warning/15 text-[#8a5f00] ring-1 ring-inset ring-warning/40 dark:text-warning'
              : 'bg-surface text-heading ring-1 ring-inset ring-line',
        state === 'danger' && !paused && left > 0 && 'animate-pulse',
        className,
      )}
    >
      <Timer className="size-4" aria-hidden />
      {text}
    </span>
  );
}
