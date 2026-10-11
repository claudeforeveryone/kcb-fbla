import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'info' | 'success' | 'error' | 'warning';
export type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms; 0 keeps it until dismissed. Default 4500 (7000 for errors). */
  duration?: number;
  action?: { label: string; onClick: () => void };
};
type ToastItem = ToastInput & { id: number; leaving?: boolean };

type ToastApi = {
  toast: (t: ToastInput) => number;
  success: (title: ReactNode, description?: ReactNode) => number;
  error: (title: ReactNode, description?: ReactNode) => number;
  info: (title: ReactNode, description?: ReactNode) => number;
  warning: (title: ReactNode, description?: ReactNode) => number;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastApi | null>(null);

const icons = {
  info: <Info className="size-5 text-blue dark:text-link" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-danger" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
};
const bars = { info: 'bg-blue', success: 'bg-success', error: 'bg-red', warning: 'bg-warning' };

const noSubscribe = () => () => {};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  // The toast layer is a portal into <body>, which only exists in the browser. False on the server and during
  // hydration of prerendered pages (so the markup matches), true right after.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 180);
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      const d = t.duration ?? (t.tone === 'error' ? 7000 : 4500);
      if (d > 0) window.setTimeout(() => dismiss(id), d);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
      info: (title, description) => toast({ title, description, tone: 'info' }),
      warning: (title, description) => toast({ title, description, tone: 'warning' }),
    }),
    [toast, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {inBrowser && createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-auto md:left-auto md:right-5 md:top-20 md:items-end md:px-0"
          aria-live="polite"
          aria-relevant="additions"
        >
          {items.map((t) => {
            const tone = t.tone ?? 'info';
            return (
              <div
                key={t.id}
                role={tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-[4px] border border-line bg-surface py-3 pl-4 pr-2 shadow-lift transition-all duration-200 ease-out',
                  t.leaving ? 'translate-y-1 opacity-0' : 'animate-slide-in',
                )}
              >
                <span className={cn('absolute inset-y-0 left-0 w-1', bars[tone])} aria-hidden />
                <span className="mt-px shrink-0">{icons[tone]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-ink">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-[0.8125rem] text-muted">{t.description}</p>}
                  {t.action && (
                    <button
                      type="button"
                      className="link mt-1.5 text-sm"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="grid size-7 shrink-0 place-items-center rounded-[2px] text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Best-effort message from anything thrown (Supabase errors, Error, string). */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string')
    return (e as { message: string }).message || fallback;
  return fallback;
}
