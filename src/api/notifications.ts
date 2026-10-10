// Notifications API: list, unread count, mark read/unread, delete, realtime, and the email opt-in.
// Rows are inserted server-side only (triggers in 0006/0007/0012 call fbla_notify); clients read and mark.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Notification } from '../lib/types';

export type { Notification };

export const NOTIFICATION_COLUMNS = 'id,user_id,kind,title,body,link,data,read_at,created_at';

/** Groups for the filter chips and icons. */
export type NotificationCategory = 'arena' | 'classroom' | 'chapter' | 'achievements' | 'social' | 'other';

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  arena: 'Arena',
  classroom: 'Classroom',
  chapter: 'Chapter',
  achievements: 'Achievements',
  social: 'Friends',
  other: 'Other',
};

export function categoryOf(kind: string): NotificationCategory {
  const k = kind.toLowerCase();
  if (k.startsWith('duel') || k.startsWith('arena') || k.startsWith('challenge')) return 'arena';
  if (k === 'achievement' || k.startsWith('achievement')) return 'achievements';
  if (k.startsWith('friend')) return 'social';
  if (k === 'announcement' || k === 'newsletter' || k.startsWith('assignment') || k.startsWith('post') || k.startsWith('classroom'))
    return 'classroom';
  if (k.startsWith('chapter') || k.startsWith('role') || k.startsWith('trainer') || k.startsWith('ban') || k.startsWith('president'))
    return 'chapter';
  return 'other';
}

export type ListOptions = {
  limit?: number;
  /** created_at of the last row already loaded (keyset pagination, newest first). */
  before?: string | null;
  unreadOnly?: boolean;
};

export async function listNotifications(userId: string, opts: ListOptions = {}): Promise<Notification[]> {
  let q = supabase
    .from('fbla_notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function unreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('fbla_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Marks the given ids read (or every unread one when ids is omitted). Returns how many changed. */
export async function markRead(ids?: string[]): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const { data, error } = await supabase.rpc('fbla_mark_notifications_read', { p_ids: ids ?? null });
  if (error) {
    // fallback: plain column update (allowed by RLS + the read_at column grant)
    let q = supabase.from('fbla_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (ids) q = q.in('id', ids);
    const { error: e2 } = await q;
    if (e2) throw e2;
    return ids?.length ?? 0;
  }
  return (data as number) ?? 0;
}

export const markAllRead = () => markRead();

export async function markUnread(id: string): Promise<void> {
  const { error } = await supabase.from('fbla_notifications').update({ read_at: null }).eq('id', id);
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('fbla_notifications').delete().eq('id', id);
  if (error) throw error;
}

/** Deletes every notification already read. */
export async function clearRead(userId: string): Promise<void> {
  const { error } = await supabase.from('fbla_notifications').delete().eq('user_id', userId).not('read_at', 'is', null);
  if (error) throw error;
}

export type NotificationChange =
  | { type: 'insert'; row: Notification }
  | { type: 'update'; row: Notification }
  | { type: 'delete'; id: string };

/** Realtime feed of the user's notification rows. Returns an unsubscribe function. */
export function subscribeNotifications(
  userId: string,
  onChange: (c: NotificationChange) => void,
  onStatus?: (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`fbla-notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'fbla_notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') onChange({ type: 'insert', row: payload.new as Notification });
        else if (payload.eventType === 'UPDATE') onChange({ type: 'update', row: payload.new as Notification });
        else if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string })?.id;
          if (id) onChange({ type: 'delete', id });
        }
      },
    )
    .subscribe((status) => onStatus?.(status as 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'));
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Weekly digest / newsletter emails on or off (email_opt_in is a member-editable profile column). */
export async function setEmailOptIn(userId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('fbla_profiles').update({ email_opt_in: on }).eq('id', userId);
  if (error) throw error;
}
