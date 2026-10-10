// Small pieces shared by the chapter pages (ChapterPage, AdminPage, MemberPage).
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { Check, Copy, Crown, GraduationCap, Link2, RefreshCw, ShieldCheck, User } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Skeleton, cn, errorMessage, useToast, type BadgeTone } from '../../../components/ui';
import { ROLE_LABELS, type ChapterRole, type ChapterInvite } from '../../../lib/types';
import { getChapterInvite, inviteUrl, rotateChapterInvite } from '../../../api/chapter';

// ------------------------------------------------------------------------------------------------ data loading

export type Loadable<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (fn: (prev: T | undefined) => T | undefined) => void;
};

/** Runs `fn` on mount and whenever deps change; ignores stale results. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList): Loadable<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (id === seq.current) setDataState(d);
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((f: (prev: T | undefined) => T | undefined) => setDataState((p) => f(p)), []);
  return { data, error, loading, reload, setData };
}

// ------------------------------------------------------------------------------------------------ formatting

export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(digits)}%`;

export const fmt = (n: number | null | undefined) => (n == null ? '–' : Math.round(n).toLocaleString());

/** Green from 80%, amber from 60%, red below. */
export function accuracyTone(v: number | null | undefined): 'success' | 'warning' | 'red' | 'neutral' {
  if (v == null) return 'neutral';
  if (v >= 0.8) return 'success';
  if (v >= 0.6) return 'warning';
  return 'red';
}

export const ACCURACY_COLOR = { success: 'var(--success)', warning: 'var(--warning)', red: 'var(--red)', neutral: 'var(--muted)' } as const;

// ------------------------------------------------------------------------------------------------ roles

const ROLE_TONE: Record<ChapterRole, BadgeTone> = { president: 'red', executive: 'navy', trainer: 'blue', member: 'neutral' };
const ROLE_ICON: Record<ChapterRole, typeof Crown> = {
  president: Crown,
  executive: ShieldCheck,
  trainer: GraduationCap,
  member: User,
};

export function RoleBadge({ role, className, iconOnlyMember }: { role: ChapterRole; className?: string; iconOnlyMember?: boolean }) {
  const Icon = ROLE_ICON[role];
  if (iconOnlyMember && role === 'member') return null;
  return (
    <Badge tone={ROLE_TONE[role]} className={className}>
      <Icon className="size-3" aria-hidden />
      {ROLE_LABELS[role]}
    </Badge>
  );
}

export const ROLE_ORDER: ChapterRole[] = ['president', 'executive', 'trainer', 'member'];

// ------------------------------------------------------------------------------------------------ clipboard

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / insecure origins
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      leftIcon={done ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else toast.error('Could not copy', 'Select the text and copy it yourself.');
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

// ------------------------------------------------------------------------------------------------ invite card

/** Join code + invite link with copy and rotate. Presidents and executives only. */
export function InviteCard({ chapterId, className }: { chapterId: string; className?: string }) {
  const toast = useToast();
  const inv = useLoad<ChapterInvite>(() => getChapterInvite(chapterId), [chapterId]);
  const [confirm, setConfirm] = useState<null | 'code' | 'token'>(null);

  const rotate = async (what: 'code' | 'token') => {
    try {
      const next = await rotateChapterInvite(chapterId, what);
      inv.setData(() => next);
      toast.success(what === 'code' ? 'New join code ready' : 'New invite link ready', 'The old one no longer works.');
    } catch (e) {
      toast.error('Could not rotate', errorMessage(e));
    }
  };

  return (
    <div className={cn('@container rounded-[12px] border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        <Link2 className="size-4" aria-hidden /> Invite members
      </div>
      {inv.loading && !inv.data ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : inv.error && !inv.data ? (
        <p className="mt-3 text-sm text-danger">
          {errorMessage(inv.error)}{' '}
          <button className="font-semibold underline" onClick={() => void inv.reload()}>
            Retry
          </button>
        </p>
      ) : inv.data ? (
        <div className="mt-3 grid gap-4 @2xl:grid-cols-[auto_1fr] @2xl:items-end">
          <div>
            <div className="text-xs text-muted">Join code</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="tabular rounded-lg bg-navy px-3 py-1.5 font-display text-2xl font-extrabold tracking-[0.25em] text-white dark:bg-surface-3"
                aria-label={`Join code ${inv.data.join_code.split('').join(' ')}`}
              >
                {inv.data.join_code}
              </span>
              <CopyButton text={inv.data.join_code} label="Copy" />
              <Button size="icon-sm" variant="ghost" aria-label="New join code" title="New join code" onClick={() => setConfirm('code')}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Invite link</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink">
                {inviteUrl(inv.data.invite_token)}
              </code>
              <CopyButton text={inviteUrl(inv.data.invite_token)} label="Copy link" />
              <Button size="icon-sm" variant="ghost" aria-label="New invite link" title="New invite link" onClick={() => setConfirm('token')}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={() => rotate(confirm!)}
        title={confirm === 'code' ? 'Make a new join code?' : 'Make a new invite link?'}
        description={
          confirm === 'code'
            ? 'The current code stops working right away. Members already in the chapter are not affected.'
            : 'Anyone holding the old link will no longer be able to join with it. Members already in the chapter are not affected.'
        }
        confirmLabel={confirm === 'code' ? 'New code' : 'New link'}
      />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ regions

export const REGIONS = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
  'Outside Canada',
];
