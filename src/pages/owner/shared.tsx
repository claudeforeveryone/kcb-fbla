// Shared pieces of the owner console: the data source (real RPCs, or fixtures in the dev gallery), a small loader
// hook, and the number formatting that keeps withheld counts visible as "Hidden" instead of a fake zero.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AuditPage,
  FeedbackFilter,
  FeedbackPatch,
  FeedbackSaved,
  OwnerContent,
  OwnerEngagement,
  OwnerFeedbackList,
  OwnerGrowth,
  OwnerOverview,
  OwnerPreparation,
  OwnerQuestion,
  OwnerUserRow,
} from '../../api/owner';
import type { FeedbackKind } from '../../lib/feedback';
import { countLabel, loadPages, mergePage, NO_DATA, type Bucket, type Count } from '../../lib/owner';
import type { ChapterRole } from '../../lib/types';
import { Button, ErrorState, Skeleton } from '../../components/ui';
import { cn } from '../../components/ui/cn';

/** Everything the console reads or changes. The page passes the real RPCs; the dev gallery passes fixtures. */
export type OwnerSource = {
  overview(): Promise<OwnerOverview>;
  growth(days: number, bucket: Bucket): Promise<OwnerGrowth>;
  engagement(days: number): Promise<OwnerEngagement>;
  preparation(days: number): Promise<OwnerPreparation>;
  content(): Promise<OwnerContent>;
  question(id: string): Promise<OwnerQuestion>;
  feedbackList(opts: { status?: FeedbackFilter; kind?: FeedbackKind | null; limit?: number; offset?: number }): Promise<OwnerFeedbackList>;
  feedbackUpdate(id: string, patch: FeedbackPatch): Promise<FeedbackSaved>;
  auditSearch(opts: { days?: number; action?: string | null; q?: string; limit?: number; offset?: number }): Promise<AuditPage>;
  userSearch(query: string): Promise<OwnerUserRow[]>;
  supportEmail(userId: string, reason: string): Promise<string | null>;
  setChapterBan(userId: string, chapterId: string, banned: boolean, reason: string): Promise<void>;
  setChapterRole(userId: string, chapterId: string, role: Exclude<ChapterRole, 'president'>, reason: string): Promise<{ changed: boolean }>;
};

const SourceCtx = createContext<OwnerSource | null>(null);
/** Told when a section's data arrives (true) or fails (false), so the header's "Updated" time is honest. */
const ReportCtx = createContext<((ok: boolean) => void) | null>(null);

export function OwnerSourceProvider({
  source,
  onLoad,
  children,
}: {
  source: OwnerSource;
  onLoad?: (ok: boolean) => void;
  children: ReactNode;
}) {
  return (
    <SourceCtx.Provider value={source}>
      <ReportCtx.Provider value={onLoad ?? null}>{children}</ReportCtx.Provider>
    </SourceCtx.Provider>
  );
}

export function useOwnerSource(): OwnerSource {
  const s = useContext(SourceCtx);
  if (!s) throw new Error('useOwnerSource must be used inside <OwnerSourceProvider>');
  return s;
}

export type Loaded<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };

/**
 * Runs `fn` whenever `key` changes (and on reload). Keeps the last data while a new load runs. A `quiet` load (a
 * detail inside a section) does not move the console's "Updated" time.
 */
export function useLoad<T>(fn: () => Promise<T>, key: string, opts?: { quiet?: boolean }): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const loud = useReport();
  const quiet = !!opts?.quiet;

  useEffect(() => {
    let live = true;
    const report = quiet ? () => {} : loud;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (!live) return;
        setState({ data, error: null, loading: false });
        report(true);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState((s) => ({ data: s.data, error, loading: false }));
        report(false);
      });
    return () => {
      live = false;
    };
  }, [key, nonce, loud, quiet]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

function useReport(): (ok: boolean) => void {
  const fn = useContext(ReportCtx);
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((ok: boolean) => ref.current?.(ok), []);
}

export type Paged<T, P> = Loaded<P> & {
  rows: T[];
  total: number;
  /** True while there are rows left and the last page brought new ones. */
  canMore: boolean;
  more: () => void;
  moreLoading: boolean;
  moreError: unknown;
};

/**
 * A list read page by page with offsets (the owner RPCs cap a page at 200 rows). A new `key` starts over; reload()
 * fetches again up to the number of rows already on screen, so a save does not drop the rows below the first page.
 */
export function usePaged<T, P extends { total: number; rows: T[] }>(
  fetchPage: (offset: number) => Promise<P>,
  key: string,
  idOf: (row: T) => string | number,
): Paged<T, P> {
  type S = { key: string; head: P | null; rows: T[]; total: number; done: boolean; error: unknown; loading: boolean };
  const [st, setSt] = useState<S>({ key, head: null, rows: [], total: 0, done: false, error: null, loading: true });
  const [more, setMore] = useState<{ loading: boolean; error: unknown }>({ loading: false, error: null });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fetchPage);
  fnRef.current = fetchPage;
  const idRef = useRef(idOf);
  idRef.current = idOf;
  const stRef = useRef(st);
  stRef.current = st;
  const report = useReport();

  useEffect(() => {
    let live = true;
    const prev = stRef.current;
    const want = prev.key === key ? prev.rows.length : 0;
    setSt((s) => ({ ...s, loading: true, error: null }));
    setMore({ loading: false, error: null });
    loadPages(fnRef.current, want, idRef.current)
      .then((r) => {
        if (!live) return;
        setSt({ key, head: r.head, rows: r.rows, total: r.total, done: r.done, error: null, loading: false });
        report(true);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setSt((s) => ({ ...s, error, loading: false }));
        report(false);
      });
    return () => {
      live = false;
    };
  }, [key, nonce, report]);

  const loadMore = useCallback(() => {
    const at = stRef.current;
    setMore({ loading: true, error: null });
    fnRef
      .current(at.rows.length)
      .then((page) => {
        setSt((s) => {
          if (s.key !== at.key) return s;
          const m = mergePage(s.rows, page.rows, idRef.current);
          return { ...s, rows: m.rows, total: page.total, done: m.added === 0 || m.rows.length >= page.total };
        });
        setMore({ loading: false, error: null });
      })
      .catch((error: unknown) => setMore({ loading: false, error }));
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = st.key === key;
  return {
    data: st.head,
    error: st.error,
    loading: st.loading,
    reload,
    rows: st.rows,
    total: st.total,
    canMore: current && !st.done && st.rows.length < st.total,
    more: loadMore,
    moreLoading: more.loading,
    moreError: more.error,
  };
}

/** "Show more" for a paged list: hidden at the end of the list or when a page brings nothing new. */
export function MoreButton({ state }: { state: Pick<Paged<unknown, never>, 'rows' | 'total' | 'canMore' | 'more' | 'moreLoading' | 'moreError'> }) {
  if (!state.canMore) return null;
  const left = state.total - state.rows.length;
  return (
    <div className="mt-3">
      <Button variant="outline" size="sm" block onClick={state.more} loading={state.moreLoading}>
        {state.moreError ? 'Try again' : `Show more (${left.toLocaleString('en-CA')} left)`}
      </Button>
      {state.moreError != null && (
        <p className="mt-1.5 text-center text-xs text-red" role="alert">
          Could not load more. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

/** Loading skeleton, error with retry, or the content. */
export function LoadState<T>({
  state,
  children,
  skeleton = 'cards',
}: {
  state: Loaded<T>;
  children: (data: T) => ReactNode;
  skeleton?: 'cards' | 'chart' | 'table';
}) {
  if (state.error) return <ErrorState title="Could not load this section" error={state.error} onRetry={state.reload} />;
  if (state.data) return <div className={cn(state.loading && 'opacity-60 transition-opacity')}>{children(state.data)}</div>;
  return <SectionSkeleton kind={skeleton} />;
}

function SectionSkeleton({ kind }: { kind: 'cards' | 'chart' | 'table' }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {kind === 'cards' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {kind === 'chart' && <Skeleton className="h-64" />}
      {kind === 'table' &&
        Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
    </div>
  );
}

const intFmt = new Intl.NumberFormat('en-CA');

/**
 * A missing figure: a muted en dash (a screen reader hears `label`). One look everywhere in the console, so an empty
 * value never reads as a number or, in an accent colour, as an alert.
 */
export function EmptyValue({ label = 'No figure' }: { label?: string }) {
  return (
    <span className="text-muted">
      <span aria-hidden="true">{NO_DATA}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A figure that may be missing (num(), fmtPercent() and friends return NO_DATA then). */
export function OrEmpty({ text }: { text: string }) {
  return text === NO_DATA ? <EmptyValue /> : <>{text}</>;
}

/** A plain number from the server that may be null because its group was suppressed. */
export function num(n: number | null | undefined): string {
  return n == null ? NO_DATA : intFmt.format(n);
}

export const HIDDEN_WHY = 'Hidden for privacy: fewer than 5 people, or a number that would reveal a group that small';

/** A Count, with "Hidden" in muted type when withheld. */
export function CountText({ c, className }: { c: Count | null | undefined; className?: string }) {
  const hidden = !!c?.suppressed;
  return (
    <span className={cn('tabular', hidden && 'text-muted', className)} title={hidden ? HIDDEN_WHY : undefined}>
      {countLabel(c)}
    </span>
  );
}

/** The one-line privacy rule, shown under sections with person counts. */
export function PrivacyNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      <span className="font-semibold">Hidden</span> means fewer than 5 people, or a number that would let you work out a
      group that small.
    </p>
  );
}

/** A bordered panel for a block of the console. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0 rounded-[4px] border border-line bg-surface p-4 sm:p-5', className)}>{children}</div>;
}

const whenFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 11, 3:04 p.m." in Toronto time. */
export function when(iso: string | null | undefined): string {
  if (!iso) return NO_DATA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_DATA : whenFmt.format(d);
}

/** "Oct 11, 2026" in Toronto time. */
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return NO_DATA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_DATA : dateFmt.format(d);
}
