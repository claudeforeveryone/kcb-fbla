// Shared pieces of the owner console: the data source (real RPCs, or fixtures in the dev gallery), a small loader
// hook, and the number formatting that keeps suppressed groups visible as "Under 5" instead of a fake zero.
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
  OwnerUserRow,
} from '../../api/owner';
import type { FeedbackKind } from '../../lib/feedback';
import { countLabel, NO_DATA, type Bucket, type Count } from '../../lib/owner';
import type { ChapterRole } from '../../lib/types';
import { ErrorState, Skeleton } from '../../components/ui';
import { cn } from '../../components/ui/cn';

/** Everything the console reads or changes. The page passes the real RPCs; the dev gallery passes fixtures. */
export type OwnerSource = {
  overview(): Promise<OwnerOverview>;
  growth(days: number, bucket: Bucket): Promise<OwnerGrowth>;
  engagement(days: number): Promise<OwnerEngagement>;
  preparation(days: number): Promise<OwnerPreparation>;
  content(): Promise<OwnerContent>;
  feedbackList(opts: { status?: FeedbackFilter; kind?: FeedbackKind | null; limit?: number; offset?: number }): Promise<OwnerFeedbackList>;
  feedbackUpdate(id: string, patch: FeedbackPatch): Promise<FeedbackSaved>;
  auditSearch(opts: { days?: number; action?: string | null; q?: string; limit?: number; offset?: number }): Promise<AuditPage>;
  userSearch(query: string): Promise<OwnerUserRow[]>;
  supportEmail(userId: string, reason: string): Promise<string | null>;
  setChapterBan(userId: string, chapterId: string, banned: boolean, reason: string): Promise<void>;
  setChapterRole(userId: string, chapterId: string, role: Exclude<ChapterRole, 'president'>, reason: string): Promise<{ changed: boolean }>;
};

const SourceCtx = createContext<OwnerSource | null>(null);

export function OwnerSourceProvider({ source, children }: { source: OwnerSource; children: ReactNode }) {
  return <SourceCtx.Provider value={source}>{children}</SourceCtx.Provider>;
}

export function useOwnerSource(): OwnerSource {
  const s = useContext(SourceCtx);
  if (!s) throw new Error('useOwnerSource must be used inside <OwnerSourceProvider>');
  return s;
}

export type Loaded<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };

/** Runs `fn` whenever `key` changes (and on reload). Keeps the last data while a new load runs. */
export function useLoad<T>(fn: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => live && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      live = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
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

/** A plain number from the server that may be null because its group was suppressed. */
export function num(n: number | null | undefined): string {
  return n == null ? NO_DATA : intFmt.format(n);
}

/** A Count, with "Under 5" in muted type when suppressed. */
export function CountText({ c, className }: { c: Count | null | undefined; className?: string }) {
  const hidden = !!c?.suppressed;
  return (
    <span className={cn('tabular', hidden && 'text-muted', className)} title={hidden ? 'Fewer than 5 people: hidden for privacy' : undefined}>
      {countLabel(c)}
    </span>
  );
}

/** The one-line privacy rule, shown under sections with person counts. */
export function PrivacyNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      Groups of 1 to 4 people show as <span className="font-semibold">Under 5</span> so no one can be picked out.
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
