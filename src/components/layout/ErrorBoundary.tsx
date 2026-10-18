import { Component, useEffect, useRef, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null; offlineAtCrash: boolean };

/** Which message a crashed page gets. */
export type CrashKind = 'offline' | 'reconnected' | 'update' | 'error';

const CHUNK_FAILURE = /dynamically imported module|Loading chunk|Importing a module script failed/i;

/**
 * A page chunk that fails to load means one of two things: the browser is offline (the service worker only keeps
 * chunks already opened), or a deploy replaced the chunk. Telling an offline visitor "a new version is available" is
 * wrong, and reloading offline only lands on the offline page.
 */
export function crashKind(message: string, net: { offlineAtCrash: boolean; online: boolean }): CrashKind {
  if (!CHUNK_FAILURE.test(message)) return 'error';
  if (!net.online) return 'offline';
  return net.offlineAtCrash ? 'reconnected' : 'update';
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Catches render errors (and failed lazy chunk loads after a deploy or offline) so one page never blanks the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, offlineAtCrash: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, offlineAtCrash: isOffline() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, offlineAtCrash: false });
  }

  render() {
    const { error, offlineAtCrash } = this.state;
    if (!error) return this.props.children;
    return <CrashNotice message={error.message} offlineAtCrash={offlineAtCrash} />;
  }
}

const COPY: Record<CrashKind, { title: string; body: string }> = {
  offline: {
    title: "You're offline",
    body: "This page needs a connection to open. It will load by itself once you're back online.",
  },
  reconnected: { title: "You're back online", body: 'Reload to open this page.' },
  update: { title: 'A new version is available', body: 'FBLC United was just updated. Reload to get the latest version.' },
  error: { title: 'This page hit a snag', body: 'Something went wrong while showing this page. Reloading usually fixes it.' },
};

function CrashNotice({ message, offlineAtCrash }: { message: string; offlineAtCrash: boolean }) {
  const online = useSyncExternalStore(subscribeOnline, () => !isOffline(), () => true);
  const kind = crashKind(message, { offlineAtCrash, online });

  // The offline message promises the page loads by itself once the connection is back: a lazy page that failed once
  // needs a full reload. Keyed on the rendered state rather than a second 'online' listener, which the re-render this
  // same event triggers would remove before it ever ran.
  const shownOffline = useRef(false);
  useEffect(() => {
    if (kind === 'offline') shownOffline.current = true;
    else if (shownOffline.current) window.location.reload();
  }, [kind]);

  const { title, body } = COPY[kind];
  const Icon = kind === 'offline' ? WifiOff : AlertTriangle;
  return (
    <div className="mx-auto grid min-h-[50vh] w-full max-w-lg place-items-center px-4 py-12" role="alert">
      <div className="w-full rounded-[4px] border border-line bg-surface p-8 text-center">
        <Icon className="mx-auto mb-4 size-6 text-red dark:text-danger" aria-hidden />
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {/* Offline it also reloads by itself on the 'online' event, but that event can be late or never come (a
            captive portal, a VPN adapter, a wrong navigator.onLine), so a manual retry is always there. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[2px] border border-navy bg-surface px-4 font-display text-sm font-semibold text-navy transition-colors hover:bg-surface-2 dark:border-link dark:text-link"
        >
          <RefreshCw className="size-4" aria-hidden /> {kind === 'offline' ? 'Try again' : 'Reload'}
        </button>
      </div>
    </div>
  );
}
