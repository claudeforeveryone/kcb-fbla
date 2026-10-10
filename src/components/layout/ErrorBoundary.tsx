import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

/** Catches render errors (and failed lazy chunk loads after a deploy) so one page never blanks the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
    return (
      <div className="mx-auto grid min-h-[50vh] w-full max-w-lg place-items-center px-4 py-12" role="alert">
        <div className="w-full rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-red/10 text-red dark:text-danger">
            <AlertTriangle className="size-6" />
          </span>
          <h1 className="text-xl font-bold">{chunk ? 'A new version is available' : 'This page hit a snag'}</h1>
          <p className="mt-2 text-sm text-muted">
            {chunk
              ? 'KCB FBLA was just updated. Reload to get the latest version.'
              : 'Something went wrong while showing this page. Reloading usually fixes it.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-navy px-4 font-display text-sm font-semibold text-white hover:bg-navy-2 dark:bg-blue"
          >
            <RefreshCw className="size-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
