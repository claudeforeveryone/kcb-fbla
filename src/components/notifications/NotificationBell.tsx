import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, BellOff, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { cn } from '../ui/cn';
import { SegmentedControl } from '../ui/Segmented';
import { Skeleton } from '../ui/Skeleton';
import { useToast, errorMessage } from '../ui/Toast';
import type { Notification } from '../../api/notifications';
import { feed, useNotificationFeed } from './store';
import { fullTime, isInternalLink, NotificationIcon, NotificationKindLabel, spokenAgo, timeAgo } from './parts';

const SHOWN = 10;

/** Top-bar bell: unread badge, dropdown with the latest 10, realtime toasts for new arrivals. */
export function NotificationBell() {
  const { user } = useAuth();
  const s = useNotificationFeed(user?.id);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellIconRef = useRef<SVGSVGElement>(null);
  const panelId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Close when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openItem = useCallback(
    (n: Notification) => {
      if (!n.read_at) feed.markRead([n.id]).catch(() => {});
      setOpen(false);
      if (isInternalLink(n.link)) navigate(n.link);
      else if (n.link) window.open(n.link, '_blank', 'noopener');
    },
    [navigate],
  );

  // New arrivals: wiggle the bell and show a toast (the full page already highlights them live).
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => {
    return feed.onArrival((n) => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduce && bellIconRef.current?.animate) {
        bellIconRef.current.animate(
          [
            { transform: 'rotate(0)' },
            { transform: 'rotate(16deg)' },
            { transform: 'rotate(-14deg)' },
            { transform: 'rotate(10deg)' },
            { transform: 'rotate(-6deg)' },
            { transform: 'rotate(0)' },
          ],
          { duration: 650, easing: 'ease-out' },
        );
      }
      if (pathRef.current === '/notifications') return;
      toast.toast({
        title: n.title,
        description: n.body ?? undefined,
        tone: (n.kind === 'duel_result' && n.data?.outcome === 'win') ? 'success' : 'info',
        duration: 6000,
        action: n.link ? { label: 'View', onClick: () => openItem(n) } : undefined,
      });
    });
  }, [toast, openItem]);

  const items = useMemo(
    () => (filter === 'unread' ? s.items.filter((n) => !n.read_at) : s.items).slice(0, SHOWN),
    [s.items, filter],
  );

  const markAll = async () => {
    try {
      await feed.markAllRead();
    } catch (e) {
      toast.error('Could not mark everything read', errorMessage(e));
    }
  };

  const badge = s.unread > 99 ? '99+' : String(s.unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={s.unread ? `Notifications, ${s.unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          'relative grid size-10 place-items-center rounded-none text-white/85 transition-colors duration-150 hover:bg-white/10 hover:text-white',
          open && 'bg-white/12 text-white',
        )}
      >
        <Bell ref={bellIconRef} className="size-5 origin-top" />
        {s.unread > 0 && (
          <span
            className="animate-pop absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-none bg-red px-1 text-[10px] font-bold leading-none text-white tabular-nums ring-2 ring-bar"
            aria-hidden
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className={cn(
            'animate-pop z-[70] flex flex-col overflow-hidden rounded-none border border-line bg-surface text-ink shadow-lift outline-none',
            'fixed inset-x-2 top-[68px] max-h-[calc(100dvh-140px)]',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[400px] sm:max-h-[min(600px,calc(100dvh-96px))] sm:origin-top-right',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3 pt-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-base font-bold text-heading">Notifications</h2>
              {s.unread > 0 && (
                <span className="rounded-none bg-red/10 px-1.5 py-0.5 text-xs font-bold text-red tabular-nums dark:text-danger">
                  {s.unread} new
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={s.unread === 0}
              className="inline-flex items-center gap-1.5 rounded-none px-2 py-1.5 text-xs font-semibold text-link transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck className="size-4" />
              Mark all read
            </button>
          </div>

          <div className="px-4 pt-3">
            <SegmentedControl
              size="sm"
              block
              aria-label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: s.unread ? `Unread (${s.unread})` : 'Unread' },
              ]}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {s.status === 'loading' || (s.status === 'idle' && !s.items.length) ? (
              <BellSkeleton />
            ) : s.status === 'error' && !s.items.length ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm font-semibold text-heading">Could not load notifications</p>
                <p className="mt-1 text-xs text-muted">{errorMessage(s.error)}</p>
                <button type="button" className="link mt-3 text-sm" onClick={() => void feed.refresh()}>
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <BellEmpty unreadOnly={filter === 'unread' && s.items.length > 0} />
            ) : (
              <ul className="space-y-0.5">
                {items.map((n) => (
                  <BellItem key={n.id} n={n} fresh={s.fresh.has(n.id)} onOpen={openItem} />
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => close(false)}
            className="group flex items-center justify-center gap-1.5 border-t border-line bg-surface-2/60 px-4 py-3 text-sm font-semibold text-link transition-colors hover:bg-surface-2"
          >
            See all notifications
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

function BellItem({ n, fresh, onOpen }: { n: Notification; fresh: boolean; onOpen: (n: Notification) => void }) {
  const toast = useToast();
  const unread = !n.read_at;
  return (
    <li className={cn('group relative rounded-none transition-colors', fresh && 'animate-rise', unread ? 'bg-blue/[0.05] dark:bg-blue/10' : '')}>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="flex w-full items-stretch gap-3 rounded-none px-2.5 py-2.5 pr-10 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        <NotificationIcon n={n} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-2 text-sm leading-snug', unread ? 'font-semibold text-heading' : 'text-ink')}>
            {n.title}
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{n.body}</span>}
          <span className="mt-1 flex items-center gap-2 text-xs text-muted" title={fullTime(n.created_at)}>
            <NotificationKindLabel n={n} />
            <span className="sr-only">{spokenAgo(n.created_at)}</span>
            <span aria-hidden>{timeAgo(n.created_at)}</span>
            {unread && <span className="sr-only">, unread</span>}
          </span>
        </span>
      </button>
      {unread && (
        <>
          <span className="pointer-events-none absolute right-4 top-4 size-2 bg-red transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 max-sm:hidden" aria-hidden />
          <button
            type="button"
            onClick={() => feed.markRead([n.id]).catch((e) => toast.error('Could not mark read', errorMessage(e)))}
            aria-label={`Mark "${n.title}" as read`}
            className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-none text-muted opacity-0 transition-opacity hover:bg-surface-3 hover:text-heading focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
          >
            <Check className="size-4" />
          </button>
        </>
      )}
    </li>
  );
}

function BellSkeleton() {
  return (
    <div className="space-y-1 px-2.5 py-1" role="status" aria-label="Loading notifications">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 py-2">
          <Skeleton className="h-12 w-[3px]" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BellEmpty({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-9 text-center">
      <span className="mb-3 text-muted/70" aria-hidden>
        {unreadOnly ? <CheckCheck className="size-5" /> : <BellOff className="size-5" />}
      </span>
      <p className="text-sm font-bold text-heading">{unreadOnly ? 'You are all caught up' : 'No notifications yet'}</p>
      <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted">
        {unreadOnly
          ? 'Nothing new since you last checked.'
          : 'Duel challenges, chapter news and assignments will show up here.'}
      </p>
    </div>
  );
}

export default NotificationBell;
