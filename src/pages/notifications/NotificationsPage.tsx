import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  PageHeader,
  Pill,
  SegmentedControl,
  Skeleton,
  Switch,
  cn,
  errorMessage,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import {
  CATEGORY_LABELS,
  categoryOf,
  setEmailOptIn,
  type Notification,
  type NotificationCategory,
} from '../../api/notifications';
import { feed, useNotificationFeed } from '../../components/notifications/store';
import {
  dayKey,
  dayLabel,
  fullTime,
  isInternalLink,
  NotificationKindLabel,
  spokenAgo,
  timeAgo,
} from '../../components/notifications/parts';

type CategoryFilter = 'all' | NotificationCategory;
const CATEGORY_ORDER: NotificationCategory[] = ['arena', 'classroom', 'chapter', 'achievements', 'social', 'other'];

export default function NotificationsPage() {
  const { user, profile, patchProfile } = useAuth();
  const s = useNotificationFeed(user?.id);
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<'all' | 'unread'>('all');
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const counts = useMemo(() => {
    const c = new Map<NotificationCategory, { total: number; unread: number }>();
    for (const n of s.items) {
      const k = categoryOf(n.kind);
      const v = c.get(k) ?? { total: 0, unread: 0 };
      v.total++;
      if (!n.read_at) v.unread++;
      c.set(k, v);
    }
    return c;
  }, [s.items]);

  const visible = useMemo(
    () =>
      s.items.filter(
        (n) => (show === 'all' || !n.read_at) && (cat === 'all' || categoryOf(n.kind) === cat),
      ),
    [s.items, show, cat],
  );

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Notification[] }[] = [];
    for (const n of visible) {
      const key = dayKey(n.created_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(n);
      else out.push({ key, label: dayLabel(n.created_at), items: [n] });
    }
    return out;
  }, [visible]);

  const readCount = s.items.filter((n) => n.read_at).length;

  const run = async (p: Promise<unknown>, failTitle: string) => {
    try {
      await p;
    } catch (e) {
      toast.error(failTitle, errorMessage(e));
    }
  };

  const open = (n: Notification) => {
    if (!n.read_at) void run(feed.markRead([n.id]), 'Could not mark read');
    if (isInternalLink(n.link)) navigate(n.link);
    else if (n.link) window.open(n.link, '_blank', 'noopener');
  };

  const markAll = async () => {
    const before = s.unread;
    try {
      await feed.markAllRead();
      if (before) toast.success(before === 1 ? 'Marked 1 notification read' : `Marked ${before} notifications read`);
    } catch (e) {
      toast.error('Could not mark everything read', errorMessage(e));
    }
  };

  const emailParam = params.get('email');
  const dismissEmailBanner = () => {
    const next = new URLSearchParams(params);
    next.delete('email');
    setParams(next, { replace: true });
  };

  const subtitle =
    s.status !== 'ready'
      ? 'Duels, chapter news, assignments and achievements, all in one place.'
      : s.unread
        ? `You have ${s.unread} unread ${s.unread === 1 ? 'notification' : 'notifications'}.`
        : 'You are all caught up.';

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle={subtitle}
        actions={
          <Button variant="inverse" onClick={markAll} disabled={!s.unread} leftIcon={<CheckCheck className="size-4" />}>
            Mark all read
          </Button>
        }
      />
      <Page>
        {emailParam && (
          <EmailBanner
            status={emailParam}
            optedIn={!!profile?.email_opt_in}
            onDismiss={dismissEmailBanner}
            onResubscribe={async () => {
              if (!user) return;
              try {
                await setEmailOptIn(user.id, true);
                patchProfile({ email_opt_in: true });
                toast.success('Emails are back on', 'You will get the weekly digest and chapter newsletters.');
                dismissEmailBanner();
              } catch (e) {
                toast.error('Could not turn emails back on', errorMessage(e));
              }
            }}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {/* toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                aria-label="Show"
                value={show}
                onChange={setShow}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'unread', label: s.unread ? `Unread (${s.unread})` : 'Unread' },
                ]}
              />
              <div className="flex items-center gap-1">
                <LiveDot live={s.live} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClear(true)}
                  disabled={!readCount}
                  leftIcon={<Trash2 className="size-4" />}
                >
                  Clear read
                </Button>
              </div>
            </div>

            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
              <Pill active={cat === 'all'} onClick={() => setCat('all')} count={s.items.length || undefined}>
                Everything
              </Pill>
              {CATEGORY_ORDER.filter((k) => counts.has(k)).map((k) => (
                <Pill key={k} active={cat === k} onClick={() => setCat(k)} count={counts.get(k)!.total}>
                  {CATEGORY_LABELS[k]}
                  {counts.get(k)!.unread > 0 && cat !== k && (
                    <span className="size-1.5 bg-red" aria-label={`${counts.get(k)!.unread} unread`} />
                  )}
                </Pill>
              ))}
            </div>

            <div className="mt-5">
              {s.status === 'loading' || s.status === 'idle' ? (
                <ListSkeleton />
              ) : s.status === 'error' && !s.items.length ? (
                <ErrorState
                  title="Could not load your notifications"
                  error={s.error}
                  onRetry={() => void feed.refresh()}
                />
              ) : !s.items.length ? (
                <EmptyState
                  icon={<Bell />}
                  title="No notifications yet"
                  description="When someone challenges you, your chapter posts news or an assignment, or you unlock an achievement, it lands here."
                  action={
                    <>
                      <ButtonLink to="/arena" leftIcon={<Swords className="size-4" />}>
                        Challenge someone
                      </ButtonLink>
                      <ButtonLink to="/play" variant="outline">
                        Practise now
                      </ButtonLink>
                    </>
                  }
                />
              ) : !visible.length ? (
                <EmptyState
                  compact
                  icon={show === 'unread' ? <CheckCheck /> : <BellOff />}
                  title={
                    show === 'unread'
                      ? cat === 'all'
                        ? 'You are all caught up'
                        : `No unread ${CATEGORY_LABELS[cat as NotificationCategory].toLowerCase()} notifications`
                      : `Nothing in ${CATEGORY_LABELS[cat as NotificationCategory]} yet`
                  }
                  description={s.hasMore ? 'Older notifications may still match. Load more to check.' : undefined}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShow('all');
                        setCat('all');
                      }}
                    >
                      Show everything
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.key} aria-label={g.label}>
                      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                        {g.label}
                        <span className="h-px flex-1 bg-line" aria-hidden />
                        <span className="tabular-nums font-semibold normal-case tracking-normal">{g.items.length}</span>
                      </h2>
                      <Card padded={false} className="overflow-hidden">
                        <ul className="divide-y divide-line">
                          {g.items.map((n) => (
                            <Row
                              key={n.id}
                              n={n}
                              fresh={s.fresh.has(n.id)}
                              onOpen={open}
                              onToggleRead={() =>
                                void run(
                                  n.read_at ? feed.markUnread(n.id) : feed.markRead([n.id]),
                                  n.read_at ? 'Could not mark unread' : 'Could not mark read',
                                )
                              }
                              onDelete={() => void run(feed.remove(n.id), 'Could not delete that notification')}
                            />
                          ))}
                        </ul>
                      </Card>
                    </section>
                  ))}
                </div>
              )}

              {s.items.length > 0 && (s.hasMore || s.loadingMore) && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    loading={s.loadingMore}
                    onClick={() => void run(feed.loadMore(), 'Could not load older notifications')}
                    leftIcon={<RefreshCw className="size-4" />}
                  >
                    Load older
                  </Button>
                </div>
              )}
              {s.items.length > 0 && !s.hasMore && visible.length > 0 && (
                <p className="mt-6 text-center text-xs text-muted">That is everything.</p>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <EmailCard />
            <Card>
              <h2 className="text-sm font-bold text-heading">What shows up here</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-muted">
                <li><strong className="font-semibold text-ink">Arena</strong> challenges, accepts and results</li>
                <li><strong className="font-semibold text-ink">Classroom</strong> announcements, newsletters and assignments</li>
                <li><strong className="font-semibold text-ink">Chapter</strong> role changes, trainer picks and new members</li>
                <li><strong className="font-semibold text-ink">Achievements</strong> the moment you unlock one</li>
              </ul>
            </Card>
          </aside>
        </div>
      </Page>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          try {
            await feed.clearRead();
            toast.success('Cleared read notifications');
          } catch (e) {
            toast.error('Could not clear notifications', errorMessage(e));
          }
          setConfirmClear(false);
        }}
        title="Clear read notifications?"
        description={`This deletes ${readCount} read ${readCount === 1 ? 'notification' : 'notifications'}. Unread ones stay.`}
        confirmLabel="Clear read"
        variant="danger"
      />
    </>
  );
}

function Row({
  n,
  fresh,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  n: Notification;
  fresh: boolean;
  onOpen: (n: Notification) => void;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const unread = !n.read_at;
  const external = !!n.link && !isInternalLink(n.link);
  return (
    <li className={cn('group relative flex items-start', unread && 'bg-blue/[0.04] dark:bg-blue/[0.08]', fresh && 'animate-rise')}>
      {unread && <span className="absolute inset-y-0 left-0 w-[3px] bg-red" aria-hidden />}
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="flex min-w-0 flex-1 items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={cn('min-w-0 flex-1 text-[0.9375rem] leading-snug', unread ? 'font-semibold text-heading' : 'text-ink')}>
              {n.title}
              {external && <ExternalLink className="ml-1 inline size-3.5 align-[-2px] text-muted" aria-label="opens in a new tab" />}
            </span>
          </span>
          {n.body && <span className="mt-1 line-clamp-3 block text-sm leading-relaxed text-muted">{n.body}</span>}
          <span className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <time dateTime={n.created_at} title={fullTime(n.created_at)}>
              <span className="sr-only">{spokenAgo(n.created_at)}</span>
              <span aria-hidden>{timeAgo(n.created_at)}</span>
            </time>
            <span aria-hidden>&middot;</span>
            <NotificationKindLabel n={n} />
            {unread && (
              <span className="inline-flex items-center gap-1 font-semibold text-red dark:text-danger">
                <span className="size-1.5 bg-current" aria-hidden />
                New
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="shrink-0 py-3 pr-2 sm:pr-3">
        <Dropdown
          width="w-52"
          trigger={(p) => (
            <button
              {...p}
              type="button"
              aria-label={`Options for "${n.title}"`}
              className={cn(
                'grid size-9 place-items-center rounded-[2px] text-muted transition-[opacity,background-color,color] hover:bg-surface-3 hover:text-heading',
                'sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100',
                p.open && 'bg-surface-3 text-heading sm:opacity-100',
              )}
            >
              <MoreHorizontal className="size-5" />
            </button>
          )}
          items={[
            ...(n.link
              ? [{ label: external ? 'Open link' : 'Open', icon: <ExternalLink />, onSelect: () => onOpen(n) }]
              : []),
            {
              label: unread ? 'Mark as read' : 'Mark as unread',
              icon: unread ? <CheckCheck /> : <Mail />,
              onSelect: onToggleRead,
            },
            { type: 'separator' as const },
            { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}

function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className="mr-1 inline-flex items-center gap-1.5 rounded-[2px] px-2 py-1 text-xs font-semibold text-muted"
      title={live ? 'New notifications appear instantly' : 'Reconnecting. New notifications will appear when the connection returns.'}
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 motion-reduce:hidden" />}
        <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-success' : 'bg-line-strong')} />
      </span>
      {live ? 'Live' : 'Offline'}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading notifications">
      {[3, 2].map((rows, g) => (
        <div key={g}>
          <Skeleton className="mb-3 h-3 w-24" />
          <Card padded={false}>
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-start gap-3.5 border-b border-line px-5 py-4 last:border-0">
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function EmailCard() {
  const { user, profile, patchProfile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user || !profile) return null;
  const on = !!profile.email_opt_in;
  const toggle = async (next: boolean) => {
    setBusy(true);
    patchProfile({ email_opt_in: next });
    try {
      await setEmailOptIn(user.id, next);
      toast.success(next ? 'Email updates on' : 'Email updates off', next ? 'Look for your first digest on Monday.' : 'You can turn them back on any time.');
    } catch (e) {
      patchProfile({ email_opt_in: !next });
      toast.error('Could not update your email setting', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-heading">Email updates</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            A Monday digest with your week (questions, accuracy, Elo, streak, open assignments) plus chapter newsletters.
          </p>
        </div>
      </div>
      <Switch
        className="mt-4"
        checked={on}
        disabled={busy}
        onChange={(v) => void toggle(v)}
        label={on ? 'On' : 'Off'}
        description="Every email has a one-click unsubscribe link."
      />
      <Link to="/me/settings" className="link mt-3 inline-block text-xs">
        More settings
      </Link>
    </Card>
  );
}

function EmailBanner({
  status,
  optedIn,
  onDismiss,
  onResubscribe,
}: {
  status: string;
  optedIn: boolean;
  onDismiss: () => void;
  onResubscribe: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const ok = status === 'unsubscribed';
  return (
    <div
      role="status"
      className={cn(
        'animate-rise relative mb-6 flex flex-col gap-3 rounded-[4px] border p-4 pr-12 sm:flex-row sm:items-center',
        ok ? 'border-blue/25 border-l-[3px] border-l-blue bg-surface' : 'border-warning/30 border-l-[3px] border-l-warning bg-surface',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold text-heading">
          {ok ? 'You are unsubscribed from FBLC emails' : 'That unsubscribe link did not work'}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {ok
            ? 'No more weekly digests or newsletter emails. Notifications here in the app keep working.'
            : 'It may be incomplete or out of date. You can switch email updates off with the toggle on this page.'}
        </p>
      </div>
      {ok && !optedIn && (
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onResubscribe();
            setBusy(false);
          }}
        >
          Turn emails back on
        </Button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-[2px] text-muted hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
