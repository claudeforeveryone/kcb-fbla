// Owner console (supabase/migrations/0100, 0105, 0106). Every call is checked server-side against
// private.platform_owners by auth uid: a non-owner gets 42501 whatever the client shows. Metrics are aggregates only,
// and any group of 1-4 people comes back as { value: null, suppressed: true }. The owner check itself is in
// src/lib/useIsOwner.ts so the app shell can use it without loading this module.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Bucket, Count, GrowthRow } from '../lib/owner';
import type { FeedbackKind, FeedbackPriority, FeedbackStatus } from '../lib/feedback';
import type { ChapterRole } from '../lib/types';
import { toApiError } from './core';

function must<T>(res: { data: unknown; error: PostgrestError | null }, fallback?: string): T {
  if (res.error) throw toApiError(res.error, fallback);
  return res.data as T;
}

// ------------------------------------------------------------------------------------------------ metrics

export type Rate = number | null;

export type OwnerOverview = {
  generated_at: string;
  timezone: string;
  tracking_since: string | null;
  accounts: Count;
  profiles: Count;
  new_accounts: { day: Count; week: Count; month: Count };
  active: { dau: Count; wau: Count; mau: Count };
  returning: Count;
  returning_rate: Rate;
  onboarding: {
    month: { created: Count; onboarded: Count; rate: Rate };
    all_time: { created: Count; onboarded: Count; rate: Rate };
  };
  answered_week: { users: Count; questions: number | null };
};

export type OwnerGrowth = { days: number; bucket: Bucket; timezone: string; series: GrowthRow[] };

export type OwnerEngagement = {
  days: number;
  features: { name: string; users: Count; events: number | null }[];
  modes: { mode: string; users: Count; attempts: number | null }[];
  practice: {
    started: { users: Count; events: number | null };
    completed: { users: Count; events: number | null };
    completion_rate: Rate;
  };
  duels: { players: Count; created: number | null; completed: number | null };
  popular_events: { code: string; users: Count; events: number | null }[];
};

export type PrepRow = {
  event: string;
  users: Count;
  attempts: number | null;
  answered: number | null;
  accuracy: Rate;
  started: Count;
  abandonment: Rate;
};
export type OwnerPreparation = { days: number; events: PrepRow[] };

export type ContentEvent = {
  event: string;
  questions: number;
  areas: number;
  easy: number;
  medium: number;
  hard: number;
  terms: number;
};
export type ReportedQuestion = {
  question_id: string;
  event: string | null;
  area: string | null;
  preview: string | null;
  reports: number;
  open: number;
  last_reported_at: string;
};
export type HardQuestion = {
  question_id: string;
  event: string | null;
  area: string | null;
  preview: string | null;
  students: Count;
  answers: number;
  accuracy: number;
};
export type OwnerContent = {
  events: ContentEvent[];
  reported_questions: ReportedQuestion[];
  hardest_questions: HardQuestion[];
  feedback_status: Partial<Record<FeedbackStatus, number>>;
};

export async function ownerOverview(): Promise<OwnerOverview> {
  return must(await supabase.rpc('fbla_owner_overview'), 'Could not load the overview.');
}

export async function ownerGrowth(days: number, bucket: Bucket): Promise<OwnerGrowth> {
  return must(await supabase.rpc('fbla_owner_growth', { p_days: days, p_bucket: bucket }), 'Could not load growth.');
}

export async function ownerEngagement(days: number): Promise<OwnerEngagement> {
  return must(await supabase.rpc('fbla_owner_engagement', { p_days: days }), 'Could not load engagement.');
}

export async function ownerPreparation(days: number): Promise<OwnerPreparation> {
  return must(await supabase.rpc('fbla_owner_preparation', { p_days: days }), 'Could not load preparation.');
}

export async function ownerContent(): Promise<OwnerContent> {
  return must(await supabase.rpc('fbla_owner_content'), 'Could not load content health.');
}

// ------------------------------------------------------------------------------------------------ feedback triage

export type OwnerFeedbackRow = {
  id: string;
  kind: FeedbackKind;
  message: string;
  page_path: string | null;
  question_id: string | null;
  question_event: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  user_id: string;
  username: string | null;
  display_name: string | null;
};
export type FeedbackFilter = 'open' | 'all' | FeedbackStatus;
export type OwnerFeedbackList = {
  total: number;
  rows: OwnerFeedbackRow[];
  counts: Record<FeedbackStatus, number>;
};

export async function ownerFeedbackList(opts: {
  status?: FeedbackFilter;
  kind?: FeedbackKind | null;
  limit?: number;
  offset?: number;
}): Promise<OwnerFeedbackList> {
  const status = opts.status ?? 'open';
  return must(
    await supabase.rpc('fbla_owner_feedback_list', {
      p_status: status === 'all' ? null : status,
      p_kind: opts.kind ?? null,
      p_limit: opts.limit ?? 50,
      p_offset: opts.offset ?? 0,
    }),
    'Could not load feedback.',
  );
}

export type FeedbackPatch = { status?: FeedbackStatus; priority?: FeedbackPriority; resolution_note?: string };
export type FeedbackSaved = Pick<
  OwnerFeedbackRow,
  'id' | 'status' | 'priority' | 'resolution_note' | 'resolved_at' | 'updated_at'
>;

export async function ownerFeedbackUpdate(id: string, patch: FeedbackPatch): Promise<FeedbackSaved> {
  return must(
    await supabase.rpc('fbla_owner_feedback_update', {
      p_id: id,
      p_status: patch.status ?? null,
      p_priority: patch.priority ?? null,
      p_resolution_note: patch.resolution_note ?? null,
    }),
    'Could not save that change.',
  );
}

// ------------------------------------------------------------------------------------------------ audit log

export type AuditRow = {
  id: number;
  created_at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  actor_id: string | null;
  actor_username: string | null;
  target_username: string | null;
};
export type AuditPage = { total: number; rows: AuditRow[]; actions: string[] };

export async function ownerAuditSearch(opts: {
  days?: number;
  action?: string | null;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditPage> {
  return must(
    await supabase.rpc('fbla_owner_audit_search', {
      p_days: opts.days ?? 90,
      p_action: opts.action || null,
      p_q: opts.q?.trim() || null,
      p_limit: opts.limit ?? 50,
      p_offset: opts.offset ?? 0,
    }),
    'Could not load the audit log.',
  );
}

// ------------------------------------------------------------------------------------------------ users

export type { ChapterRole };
export type OwnerUserRow = {
  user_id: string;
  username: string;
  display_name: string;
  created_at: string;
  last_seen_at: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  chapter_role: ChapterRole | null;
  bans: { chapter_id: string; chapter_name: string }[];
};

export async function ownerUserSearch(query: string, limit = 20): Promise<OwnerUserRow[]> {
  if (query.trim().length < 2) return [];
  const rows = must<OwnerUserRow[] | null>(
    await supabase.rpc('fbla_owner_user_search', { p_query: query.trim(), p_limit: limit }),
    'Search failed.',
  );
  return rows ?? [];
}

/** Returns the account email. Needs a reason of 10+ characters; every lookup is written to the audit log. */
export async function ownerSupportEmail(userId: string, reason: string): Promise<string | null> {
  const res = must<{ email: string | null } | null>(
    await supabase.rpc('fbla_owner_support_email', { p_user: userId, p_reason: reason.trim() }),
    'Could not look up the email.',
  );
  return res?.email ?? null;
}

export async function ownerSetChapterBan(userId: string, chapterId: string, banned: boolean, reason: string): Promise<void> {
  must(
    await supabase.rpc('fbla_owner_set_chapter_ban', {
      p_user: userId,
      p_chapter: chapterId,
      p_banned: banned,
      p_reason: reason.trim() || null,
    }),
    banned ? 'Could not ban this player.' : 'Could not lift the ban.',
  );
}

export async function ownerSetChapterRole(
  userId: string,
  chapterId: string,
  role: Exclude<ChapterRole, 'president'>,
  reason: string,
): Promise<{ changed: boolean }> {
  return must(
    await supabase.rpc('fbla_owner_set_chapter_role', {
      p_user: userId,
      p_chapter: chapterId,
      p_role: role,
      p_reason: reason.trim() || null,
    }),
    'Could not change the role.',
  );
}
