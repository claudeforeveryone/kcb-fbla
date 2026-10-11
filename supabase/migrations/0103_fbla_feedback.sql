-- 0103 FBLA feedback (Omega owner console). Ledger name: fbla_0103_feedback.
--
-- Members send feedback from the account menu ("Send feedback") and from exam review ("Report this question").
-- A member can insert rows as themselves (only the report columns; status, priority and notes are server-side)
-- and read their own rows, including the status and the note the team leaves for them. They cannot update or
-- delete. Owners list and triage everything through the SECURITY DEFINER owner RPCs (0106); the table grants
-- clients nothing else. Rate limit: 10 reports an hour, 40 a day per member, counted under a per-member advisory
-- lock so parallel requests cannot all pass the check at once.

create table if not exists public.fbla_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'feature', 'general', 'question_issue', 'resource_issue', 'accessibility')),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  page_path text check (page_path is null or (char_length(page_path) <= 200 and page_path ~ '^/[^?#[:space:]]*$')),
  question_id text check (question_id is null
    or (kind = 'question_issue' and question_id ~ '^[A-Za-z0-9_:.-]{1,80}$')),
  status text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'resolved', 'wontfix')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.fbla_feedback is
  'Omega feedback (FBLA). Members insert/read their own (column grants + RLS); owners triage via fbla_owner_feedback_* RPCs.';

create index if not exists fbla_feedback_status_idx on public.fbla_feedback (status, created_at desc);
create index if not exists fbla_feedback_user_idx on public.fbla_feedback (user_id, created_at desc);
create index if not exists fbla_feedback_question_idx on public.fbla_feedback (question_id) where question_id is not null;

alter table public.fbla_feedback enable row level security;
revoke all on table public.fbla_feedback from public, anon, authenticated;
-- Column grants: a member sees their report, its status and the team's note, not who on the team handled it or the
-- priority the team gave it (the triage screen tells the owner only owners see priority).
grant select (id, user_id, kind, message, page_path, question_id, status, resolution_note,
              created_at, updated_at, resolved_at)
  on table public.fbla_feedback to authenticated;
grant insert (user_id, kind, message, page_path, question_id) on table public.fbla_feedback to authenticated;

drop policy if exists fbla_feedback_insert_own on public.fbla_feedback;
create policy fbla_feedback_insert_own on public.fbla_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists fbla_feedback_select_own on public.fbla_feedback;
create policy fbla_feedback_select_own on public.fbla_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Insert: normalise and rate-limit. Update (owner RPCs only): stamp updated_at.
-- The page path loses any chapter invite token (a bearer secret: whoever has it can join) and any attempt, duel,
-- member, test or profile id, replaced by the route name. The app does the same before sending (PATH_IDS in
-- src/lib/feedback.ts, and feedback.test.ts checks the two lists match); this covers a direct insert.
create or replace function fbla_private.fbla_feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour int;
  v_day int;
  v_path text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;

  -- BEFORE triggers run ahead of the RLS check (user_id = auth.uid()). Refuse a report filed as someone else here,
  -- before taking their lock or counting their rows, so the answer never depends on how much they sent.
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'You can only send feedback as yourself.' using errcode = '42501';
  end if;

  new.message := btrim(new.message);
  if new.page_path is not null then
    v_path := new.page_path;
    v_path := regexp_replace(v_path, '^/chapter/join/[^/]+', '/chapter/join/:token');
    v_path := regexp_replace(v_path, '^/play/review/[^/]+', '/play/review/:attempt');
    v_path := regexp_replace(v_path, '^/arena/[^/]+', '/arena/:duel');
    v_path := regexp_replace(v_path, '^/chapter/member/[^/]+', '/chapter/member/:member');
    v_path := regexp_replace(v_path, '^/chapter/tests/[^/]+', '/chapter/tests/:test');
    v_path := regexp_replace(v_path, '^/u/[^/]+', '/u/:username');
    new.page_path := left(v_path, 200);
  end if;
  new.status := 'new';
  new.priority := 'normal';
  new.resolution_note := null;
  new.reviewed_by := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();

  -- Parallel inserts from one member queue here, so each one counts the rows the others committed.
  perform pg_advisory_xact_lock(hashtextextended('fbla_feedback:' || new.user_id::text, 0));
  select count(*) filter (where f.created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
    from public.fbla_feedback f
   where f.user_id = new.user_id and f.created_at > now() - interval '1 day';
  if v_hour >= 10 or v_day >= 40 then
    raise exception 'You have sent a lot of feedback. Try again later.' using errcode = '53400';
  end if;
  return new;
end;
$$;

drop trigger if exists fbla_feedback_guard on public.fbla_feedback;
create trigger fbla_feedback_guard
  before insert or update on public.fbla_feedback
  for each row execute function fbla_private.fbla_feedback_guard();

-- Analytics: one feedback_submitted event per report, carrying only its kind.
create or replace function fbla_private.fbla_trg_analytics_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform fbla_private.fbla_record_event('feedback_submitted', new.user_id, null,
      jsonb_build_object('kind', new.kind));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_feedback on public.fbla_feedback;
create trigger fbla_analytics_feedback
  after insert on public.fbla_feedback
  for each row execute function fbla_private.fbla_trg_analytics_feedback();

revoke all on function fbla_private.fbla_feedback_guard() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_analytics_feedback() from public, anon, authenticated;
