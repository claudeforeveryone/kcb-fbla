// One shared notifications feed per signed-in user: first page + unread count + a single realtime channel.
// The bell (always mounted in the top bar) and the /notifications page both read it, so marking something read
// in one place updates the other instantly.

import { useEffect, useSyncExternalStore } from 'react';
import {
  clearRead as apiClearRead,
  deleteNotification,
  listNotifications,
  markRead as apiMarkRead,
  markUnread as apiMarkUnread,
  subscribeNotifications,
  unreadCount,
  type Notification,
} from '../../api/notifications';

const PAGE = 30;

export type FeedState = {
  userId: string | null;
  items: Notification[];
  unread: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  /** Realtime channel is connected. */
  live: boolean;
  /** Ids that arrived over realtime during this session (for a highlight). */
  fresh: ReadonlySet<string>;
};

const initial: FeedState = {
  userId: null,
  items: [],
  unread: 0,
  status: 'idle',
  error: null,
  hasMore: false,
  loadingMore: false,
  live: false,
  fresh: new Set(),
};

let state: FeedState = initial;
const listeners = new Set<() => void>();
const arrivalListeners = new Set<(n: Notification) => void>();
let refs = 0;
let unsubscribe: (() => void) | null = null;
let teardownTimer: number | null = null;
let loadSeq = 0;

function set(patch: Partial<FeedState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const byNewest = (a: Notification, b: Notification) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1;

function merge(existing: Notification[], incoming: Notification[]): Notification[] {
  const map = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) map.set(n.id, n);
  return Array.from(map.values()).sort(byNewest);
}

async function loadFirst(userId: string, quiet = false) {
  const seq = ++loadSeq;
  if (!quiet) set({ status: state.items.length ? state.status : 'loading', error: null });
  try {
    const [rows, count] = await Promise.all([listNotifications(userId, { limit: PAGE }), unreadCount(userId)]);
    if (seq !== loadSeq || state.userId !== userId) return;
    // keep older pages the user already loaded; replace the newest window
    const oldest = rows.length ? rows[rows.length - 1].created_at : null;
    const keep = oldest ? state.items.filter((n) => n.created_at < oldest) : [];
    set({
      items: merge(keep, rows),
      unread: count,
      status: 'ready',
      error: null,
      hasMore: state.items.length > rows.length ? state.hasMore : rows.length === PAGE,
    });
  } catch (e) {
    if (seq !== loadSeq || state.userId !== userId) return;
    if (!quiet || state.status !== 'ready') set({ status: 'error', error: e });
  }
}

function onVisible() {
  if (document.visibilityState === 'visible' && state.userId) void loadFirst(state.userId, true);
}

function connect(userId: string) {
  if (teardownTimer) {
    window.clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  refs++;
  if (state.userId === userId && unsubscribe) return;
  disconnectNow();
  state = { ...initial, userId, fresh: new Set() };
  void loadFirst(userId);
  let wasLive = false;
  unsubscribe = subscribeNotifications(
    userId,
    (c) => {
      if (state.userId !== userId) return;
      if (c.type === 'insert') {
        if (state.items.some((n) => n.id === c.row.id)) return;
        const fresh = new Set(state.fresh);
        fresh.add(c.row.id);
        set({ items: merge(state.items, [c.row]), unread: state.unread + (c.row.read_at ? 0 : 1), fresh });
        arrivalListeners.forEach((l) => l(c.row));
      } else if (c.type === 'update') {
        const prev = state.items.find((n) => n.id === c.row.id);
        if (!prev) {
          void unreadCount(userId).then((n) => state.userId === userId && set({ unread: n })).catch(() => {});
          return;
        }
        const delta = (prev.read_at ? 0 : 1) - (c.row.read_at ? 0 : 1);
        set({
          items: state.items.map((n) => (n.id === c.row.id ? c.row : n)),
          unread: Math.max(0, state.unread - delta),
        });
      } else {
        const prev = state.items.find((n) => n.id === c.id);
        if (!prev) return;
        set({
          items: state.items.filter((n) => n.id !== c.id),
          unread: Math.max(0, state.unread - (prev.read_at ? 0 : 1)),
        });
      }
    },
    (status) => {
      const live = status === 'SUBSCRIBED';
      if (live && wasLive === false && state.status === 'ready') void loadFirst(userId, true); // catch up after a drop
      wasLive = live;
      if (state.live !== live) set({ live });
    },
  );
  document.addEventListener('visibilitychange', onVisible);
}

function disconnectNow() {
  unsubscribe?.();
  unsubscribe = null;
  document.removeEventListener('visibilitychange', onVisible);
}

function release() {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  // brief grace period so route changes don't tear down and rebuild the channel
  teardownTimer = window.setTimeout(() => {
    teardownTimer = null;
    if (refs === 0) {
      disconnectNow();
      state = initial;
      listeners.forEach((l) => l());
    }
  }, 4000);
}

// ------------------------------------------------------------------------------------------------ actions
function patchRead(ids: string[] | null, readAt: string | null) {
  let delta = 0;
  const items = state.items.map((n) => {
    if (ids && !ids.includes(n.id)) return n;
    const was = !n.read_at;
    const now = !readAt;
    if (was === now) return n;
    delta += now ? 1 : -1;
    return { ...n, read_at: readAt };
  });
  return { items, unread: Math.max(0, state.unread + delta) };
}

export const feed = {
  async markRead(ids: string[]) {
    const unreadIds = ids.filter((id) => state.items.find((n) => n.id === id && !n.read_at));
    if (!unreadIds.length) return;
    const before = state;
    set(patchRead(unreadIds, new Date().toISOString()));
    try {
      await apiMarkRead(unreadIds);
    } catch (e) {
      set({ items: before.items, unread: before.unread });
      throw e;
    }
  },
  async markAllRead() {
    if (state.unread === 0) return;
    const before = state;
    set({ ...patchRead(null, new Date().toISOString()), unread: 0 });
    try {
      await apiMarkRead();
    } catch (e) {
      set({ items: before.items, unread: before.unread });
      throw e;
    }
  },
  async markUnread(id: string) {
    const before = state;
    set(patchRead([id], null));
    try {
      await apiMarkUnread(id);
    } catch (e) {
      set({ items: before.items, unread: before.unread });
      throw e;
    }
  },
  async remove(id: string) {
    const before = state;
    const prev = state.items.find((n) => n.id === id);
    set({
      items: state.items.filter((n) => n.id !== id),
      unread: Math.max(0, state.unread - (prev && !prev.read_at ? 1 : 0)),
    });
    try {
      await deleteNotification(id);
    } catch (e) {
      set({ items: before.items, unread: before.unread });
      throw e;
    }
  },
  /** Deletes every read notification. */
  async clearRead() {
    const uid = state.userId;
    if (!uid) return;
    const before = state;
    set({ items: state.items.filter((n) => !n.read_at) });
    try {
      await apiClearRead(uid);
    } catch (e) {
      set({ items: before.items });
      throw e;
    }
  },
  async loadMore() {
    const uid = state.userId;
    if (!uid || state.loadingMore || !state.hasMore) return;
    const last = state.items[state.items.length - 1];
    set({ loadingMore: true });
    try {
      const rows = await listNotifications(uid, { limit: PAGE, before: last?.created_at ?? null });
      if (state.userId !== uid) return;
      set({ items: merge(state.items, rows), hasMore: rows.length === PAGE, loadingMore: false });
    } catch (e) {
      set({ loadingMore: false });
      throw e;
    }
  },
  refresh() {
    if (state.userId) return loadFirst(state.userId);
    return Promise.resolve();
  },
  onArrival(cb: (n: Notification) => void) {
    arrivalListeners.add(cb);
    return () => {
      arrivalListeners.delete(cb);
    };
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => state;

/** Connects the shared feed for this user while mounted and returns its state. */
export function useNotificationFeed(userId: string | null | undefined): FeedState {
  useEffect(() => {
    if (!userId) return;
    connect(userId);
    return release;
  }, [userId]);
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return userId && s.userId === userId ? s : { ...initial, status: userId ? 'loading' : 'idle' };
}
