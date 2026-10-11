-- 0101 FBLA analytics events (Omega owner console). Ledger name: fbla_0101_analytics.
--
-- Privacy-conscious product analytics. A row holds a fixed event name, a timestamp, the user id (used only for
-- distinct-user counts), an optional event code (an FBLA event slug such as "accounting") and a tiny enum-only
-- metadata object. Never question text, answers, free text, IP, user agent or location.
--
-- Nobody reads or writes the table directly: RLS is on and every client privilege is revoked.
--   * Clients write through public.fbla_track(name, event_code, meta), which validates, rate-limits per user and
--     stamps auth.uid(). It accepts only the client-side events below; server events are refused.
--   * The database writes server events itself (0102 triggers on attempts, duels, vocab reviews, profiles, feedback)
--     through fbla_private.fbla_record_event, which no client can execute.
--   * Owners read aggregates only, through the owner RPCs (0105).
--   * Rows older than 13 months are purged daily by pg_cron (fbla_private.fbla_purge_analytics).

create schema if not exists fbla_private;

create table if not exists public.fbla_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'account_created', 'onboarding_completed', 'event_selected', 'practice_started', 'practice_completed',
    'exam_completed', 'vocab_session_completed', 'resource_opened', 'duel_started', 'duel_completed',
    'feedback_submitted', 'install_prompt_shown', 'app_installed', 'push_enabled')),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_code text check (event_code is null or event_code ~ '^[a-z0-9_-]{1,40}$'),
  meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 256),
  created_at timestamptz not null default now()
);

comment on table public.fbla_analytics_events is
  'Omega analytics (FBLA). Aggregate-only, no client access. Write via fbla_track() or server triggers; read via fbla_owner_* RPCs. Purged after 13 months.';

create index if not exists fbla_analytics_events_created_idx on public.fbla_analytics_events (created_at);
create index if not exists fbla_analytics_events_user_idx on public.fbla_analytics_events (user_id, created_at);
create index if not exists fbla_analytics_events_name_idx on public.fbla_analytics_events (event_name, created_at);

alter table public.fbla_analytics_events enable row level security;
revoke all on table public.fbla_analytics_events from public, anon, authenticated;

-- Shared metadata validator: keys from a fixed list, values short lowercase tokens or small non-negative numbers.
create or replace function fbla_private.fbla_meta_ok(p_meta jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_val jsonb;
  v_num numeric;
begin
  if p_meta is null then return true; end if;
  if jsonb_typeof(p_meta) <> 'object' or octet_length(p_meta::text) > 256 then return false; end if;
  for v_key, v_val in select key, value from jsonb_each(p_meta) loop
    if v_key not in ('mode', 'source', 'outcome', 'step', 'kind', 'count') then
      return false;
    end if;
    if jsonb_typeof(v_val) = 'string' then
      if (v_val #>> '{}') !~ '^[a-z0-9_:-]{1,32}$' then return false; end if;
    elsif jsonb_typeof(v_val) = 'number' then
      v_num := (v_val #>> '{}')::numeric;
      if v_num < 0 or v_num > 100000 or v_num <> trunc(v_num) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Server-side writer, used by the 0102/0103 triggers. Never granted to clients.
create or replace function fbla_private.fbla_record_event(
  p_name text, p_user uuid, p_code text default null, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  insert into public.fbla_analytics_events (event_name, user_id, event_code, meta)
  values (p_name, p_user,
          case when p_code ~ '^[a-z0-9_-]{1,40}$' then p_code end,
          case when fbla_private.fbla_meta_ok(p_meta) then coalesce(p_meta, '{}'::jsonb) else '{}'::jsonb end);
end;
$$;

-- Client entry point (fire-and-forget from the browser).
-- Accepts only events the browser is the right source for. Everything the database already knows (attempts graded,
-- duels settled, vocab reviews, profiles created, feedback filed) is recorded server-side and refused here, so a
-- client cannot inflate those numbers. Over the rate limit (30 client events a minute, 500 a day per user; server
-- events do not count against it) it quietly does nothing.
create or replace function public.fbla_track(
  p_name text, p_event_code text default null, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_minute int;
  v_day int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_name is null or p_name not in (
      'event_selected', 'practice_started', 'resource_opened', 'install_prompt_shown', 'app_installed', 'push_enabled') then
    raise exception 'unknown analytics event' using errcode = '22023';
  end if;
  if p_event_code is not null and p_event_code !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'bad event code' using errcode = '22023';
  end if;
  if not fbla_private.fbla_meta_ok(coalesce(p_meta, '{}'::jsonb)) then
    raise exception 'metadata not allowed' using errcode = '22023';
  end if;

  select count(*) filter (where e.created_at > now() - interval '1 minute'), count(*)
    into v_minute, v_day
    from public.fbla_analytics_events e
   where e.user_id = v_uid and e.created_at > now() - interval '1 day'
     and e.event_name in ('event_selected', 'practice_started', 'resource_opened', 'install_prompt_shown',
                          'app_installed', 'push_enabled');
  if v_minute >= 30 or v_day >= 500 then
    return;
  end if;

  insert into public.fbla_analytics_events (event_name, user_id, event_code, meta)
  values (p_name, v_uid, p_event_code, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- Retention: 13 months. Returns the number of rows removed.
create or replace function fbla_private.fbla_purge_analytics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gone integer;
begin
  delete from public.fbla_analytics_events where created_at < now() - interval '13 months';
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

-- fbla_private is USAGE-granted to authenticated (existing helpers live there), and functions default to PUBLIC
-- execute, so every function here is closed explicitly.
revoke all on function fbla_private.fbla_meta_ok(jsonb) from public, anon, authenticated;
revoke all on function fbla_private.fbla_record_event(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function fbla_private.fbla_purge_analytics() from public, anon, authenticated;
revoke all on function public.fbla_track(text, text, jsonb) from public, anon;
grant execute on function public.fbla_track(text, text, jsonb) to authenticated;

-- Daily purge at 07:17 UTC (03:17 Toronto in summer). pg_cron is installed on this project (fbla-weekly-digest).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'fbla-analytics-purge') then
      perform cron.unschedule('fbla-analytics-purge');
    end if;
    perform cron.schedule('fbla-analytics-purge', '17 7 * * *', 'select fbla_private.fbla_purge_analytics();');
  end if;
end;
$$;
