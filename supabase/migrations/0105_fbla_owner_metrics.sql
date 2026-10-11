-- 0105 FBLA owner metrics (Omega owner console). Ledger name: fbla_0105_owner_metrics.
--
-- Aggregate, read-only RPCs for the owner console. Every public function starts with the public.is_platform_owner()
-- check and runs as definer, so the underlying tables stay closed to clients.
--
-- Privacy. A count of people comes back as a Count: {"value": n, "suppressed": false} when shown, or
-- {"value": null, "suppressed": true} when hidden. The rules below keep a group of 1 to 4 people from being shown, or
-- from being worked out by adding or subtracting other numbers in the same response:
--   1. Small groups. A count of 1 to 4 people is hidden; 0 and 5+ are shown (fbla_count).
--   2. Tied numbers. Event counts (times, runs, answers) that belong to a hidden group are hidden too.
--   3. Nested groups. When a response shows a group and a smaller group inside it (active this week and active
--      today), the larger count is also hidden whenever the gap between them is 1 to 4, because subtracting would give
--      that small group away (fbla_count_over). The pairs: Overview, active today / answering this week / returning /
--      this month's finished sign-ups inside active this week and this month; Growth, practising and finished sign-up
--      inside active, per bucket; Engagement, each practice mode inside students who finished, and students who played
--      a duel run inside duel players.
--   4. Rates are worked out only from counts the response shows, so a rate never brings back a hidden count.
--   5. Account totals. Overview and Growth share one series of end-of-day account totals (fbla_account_totals).
--      Walking back from today, a total is shown only when it is 0 or 5+ and differs from the last shown (later) total
--      by 0 or 5+. Every new-account count is the gap between two shown totals, and hidden when either is hidden. Any
--      two shown totals, in any range, bucket size or section, therefore differ by 0 or 5+, and no hidden sign-up
--      count can be rebuilt from them. A day gets the same answer whatever range asks for it, because the walk always
--      starts from today.
-- Hidden does not always mean "under 5": a count can be hidden by rule 3 or 5 and be larger. The console says
-- "Hidden" for all of them and never says which rule applied (saying it would narrow the value down).
-- What this does not cover: numbers from different responses that are not additive, such as a Sunday's weekly
-- active bucket in Growth against Overview's 7-day active count, Growth's per-bucket "finished sign-up" profiles
-- against Overview's onboarding cohorts, or today's figures against yesterday's. Groups in one response that overlap
-- without one sitting inside the other are not covered either: students who started practice against students who
-- finished (a resumed run finishes without a new start), or students per event against students who chose any event.
-- Comparing those can narrow a hidden value down. Closing that needs noise or rounding, which the console does not use
-- at this size. No email, no free text, no per-user rows: question previews (site content, never keys or
-- explanations) appear in content health.
--
-- Scope: FBLA and DECA share auth.users. An account counts for FBLA when it has an FBLA profile, or its sign-up
-- metadata says app = 'kcb-fbla' / 'fbla', or it has no app marker, no DECA profile, and was made before FBLA started
-- tagging its sign-ups (fbla_private.fbla_owner_settings 'unmarked_accounts_before', set when this migration is
-- applied, together with the deploy whose sign-up form adds app = 'kcb-fbla'). After that moment an unmarked account
-- with no FBLA profile is not counted: it could be a DECA sign-up. DECA sign-ups should still set app = 'deca'.
--
-- Activity = an analytics event the student caused, or a graded attempt. duel_completed is left out: the second
-- player's submission records it for both players, so it is not something the first player did that day.
-- Days are America/Toronto calendar days.

create or replace function fbla_private.fbla_count(p_n bigint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'value', case when coalesce(p_n, 0) between 1 and 4 then null else coalesce(p_n, 0) end,
    'suppressed', coalesce(p_n, 0) between 1 and 4);
$$;

-- The shown value of a Count, or null when it is hidden.
create or replace function fbla_private.fbla_shown(p_c jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_c is null or coalesce((p_c ->> 'suppressed')::boolean, true) then null
              else (p_c ->> 'value')::bigint end;
$$;

-- A count of a group that contains other groups the same response shows (p_subs: their shown values; nulls, for
-- hidden ones, are ignored). Hidden when it is 1-4, or when it is 1-4 more than any of them.
create or replace function fbla_private.fbla_count_over(p_n bigint, p_subs bigint[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_n, 0) between 1 and 4
      or exists (select 1 from unnest(coalesce(p_subs, '{}'::bigint[])) as s(v)
                  where s.v is not null and coalesce(p_n, 0) - s.v between 1 and 4)
      then jsonb_build_object('value', null, 'suppressed', true)
    else jsonb_build_object('value', coalesce(p_n, 0), 'suppressed', false) end;
$$;

-- A Count that some other rule already decided to show or hide.
create or replace function fbla_private.fbla_count_if(p_n bigint, p_shown boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_shown, false) then jsonb_build_object('value', coalesce(p_n, 0), 'suppressed', false)
              else jsonb_build_object('value', null, 'suppressed', true) end;
$$;

-- The gap between two account totals (accounts created between two days): shown only when both totals are shown.
create or replace function fbla_private.fbla_count_between(p_hi bigint, p_hi_shown boolean, p_lo bigint, p_lo_shown boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select fbla_private.fbla_count_if(p_hi - p_lo, coalesce(p_hi_shown, false) and coalesce(p_lo_shown, false));
$$;

-- A 0-1 rate, null unless the denominator is 5+ and neither the numerator nor the remainder is 1-4. Callers pass shown
-- values only (a null in, for a hidden count, gives a null rate).
create or replace function fbla_private.fbla_rate(p_num bigint, p_den bigint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_den is null or p_den < 5 or p_num is null then null
    when p_num between 1 and 4 or (p_den - p_num) between 1 and 4 then null
    else round(least(1, greatest(0, p_num::numeric / p_den)), 3) end;
$$;

create or replace function fbla_private.fbla_local_day(p_ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone 'America/Toronto')::date;
$$;

create or replace function fbla_private.fbla_day_start(p_day date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'America/Toronto';
$$;

-- Settings the owner metrics read. 'unmarked_accounts_before': accounts with no app marker made before this moment
-- count for FBLA (see the scope note above). It is the time this migration is applied; integration applies it with
-- the deploy that tags FBLA sign-ups. If the two end up far apart, set it to the deploy time:
--   update fbla_private.fbla_owner_settings set at = '<deploy time>' where key = 'unmarked_accounts_before';
create table if not exists fbla_private.fbla_owner_settings (
  key text primary key,
  at timestamptz not null,
  note text
);
alter table fbla_private.fbla_owner_settings enable row level security;
revoke all on table fbla_private.fbla_owner_settings from public, anon, authenticated;
insert into fbla_private.fbla_owner_settings (key, at, note)
values ('unmarked_accounts_before', now(),
        'Accounts with no app marker made before this count for FBLA; later ones only once they make an FBLA profile.')
on conflict (key) do nothing;

-- FBLA-scoped accounts (see the scope note above). DECA's profile table lives in the same project; the check is
-- skipped where it does not exist, so these migrations still run on a database without DECA.
create or replace function fbla_private.fbla_accounts()
returns table (user_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_before timestamptz := (select s.at from fbla_private.fbla_owner_settings s where s.key = 'unmarked_accounts_before');
begin
  if to_regclass('public.deca_profiles') is null then
    return query
      select u.id, u.created_at
        from auth.users u
       where not coalesce(u.is_anonymous, false)
         and (exists (select 1 from public.fbla_profiles p where p.id = u.id)
              or u.raw_user_meta_data ->> 'app' in ('kcb-fbla', 'fbla')
              or (u.raw_user_meta_data ->> 'app' is null and u.created_at < v_before));
  else
    return query
      select u.id, u.created_at
        from auth.users u
       where not coalesce(u.is_anonymous, false)
         and (exists (select 1 from public.fbla_profiles p where p.id = u.id)
              or u.raw_user_meta_data ->> 'app' in ('kcb-fbla', 'fbla')
              or (u.raw_user_meta_data ->> 'app' is null and u.created_at < v_before
                  and not exists (select 1 from public.deca_profiles d where d.id = u.id)));
  end if;
end;
$$;

-- Activity rows (one per analytics event the student caused, or graded attempt) in [p_from, p_to).
create or replace function fbla_private.fbla_activity(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, ts timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, e.created_at from public.fbla_analytics_events e
   where e.created_at >= p_from and e.created_at < p_to and e.event_name <> 'duel_completed'
  union all
  select a.user_id, a.created_at from public.fbla_attempts a
   where a.created_at >= p_from and a.created_at < p_to;
$$;

-- End-of-day FBLA account totals for every Toronto day from p_from - 1 to today, and whether each may be shown
-- (rule 5 above). Newest first.
create or replace function fbla_private.fbla_account_totals(p_from date)
returns table (day date, total bigint, shown boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := fbla_private.fbla_local_day(now());
  v_start date := least(p_from, v_today) - 1;
  v_before bigint;
  v_last bigint;
  r record;
begin
  select count(*) into v_before
    from fbla_private.fbla_accounts() a
   where fbla_private.fbla_local_day(a.created_at) < v_start;

  for r in
    select x.d, x.t
      from (select g::date as d,
                   v_before + coalesce(sum(coalesce(c.n, 0)) over (order by g::date), 0)::bigint as t
              from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as g
              left join (select fbla_private.fbla_local_day(a.created_at) as d, count(*) as n
                           from fbla_private.fbla_accounts() a
                          group by 1) c on c.d = g::date) x
     order by x.d desc
  loop
    day := r.d;
    total := r.t;
    shown := not (r.t between 1 and 4) and (v_last is null or not (v_last - r.t between 1 and 4));
    if shown then
      v_last := r.t;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function fbla_private.fbla_count(bigint) from public, anon, authenticated;
revoke all on function fbla_private.fbla_shown(jsonb) from public, anon, authenticated;
revoke all on function fbla_private.fbla_count_over(bigint, bigint[]) from public, anon, authenticated;
revoke all on function fbla_private.fbla_count_if(bigint, boolean) from public, anon, authenticated;
revoke all on function fbla_private.fbla_count_between(bigint, boolean, bigint, boolean) from public, anon, authenticated;
revoke all on function fbla_private.fbla_rate(bigint, bigint) from public, anon, authenticated;
revoke all on function fbla_private.fbla_local_day(timestamptz) from public, anon, authenticated;
revoke all on function fbla_private.fbla_day_start(date) from public, anon, authenticated;
revoke all on function fbla_private.fbla_accounts() from public, anon, authenticated;
revoke all on function fbla_private.fbla_activity(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function fbla_private.fbla_account_totals(date) from public, anon, authenticated;

-- Overview: accounts, sign-ups, onboarding conversion, active users, returning users.
create or replace function public.fbla_owner_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := fbla_private.fbla_local_day(now());
  v_day timestamptz := fbla_private.fbla_day_start(v_today);
  v_week timestamptz := fbla_private.fbla_day_start(v_today - 6);
  v_month timestamptz := fbla_private.fbla_day_start(v_today - 29);
  v_t0 bigint;
  v_t1 bigint;
  v_t7 bigint;
  v_t30 bigint;
  v_s0 boolean;
  v_s1 boolean;
  v_s7 boolean;
  v_s30 boolean;
  v_new_month bigint;
  v_onb_month bigint;
  v_onb_all bigint;
  v_month_ok boolean;
  v_all_ok boolean;
  v_dau bigint;
  v_wau bigint;
  v_mau bigint;
  v_returning bigint;
  v_answer_users bigint;
  v_answered bigint;
  v_dau_c jsonb;
  v_ans_c jsonb;
  v_ret_c jsonb;
  v_wau_c jsonb;
  v_mau_c jsonb;
  v_since timestamptz;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Account totals at the end of today, yesterday, 7 and 30 days ago (shared with Growth, rule 5).
  select max(t.total) filter (where t.day = v_today), bool_or(t.shown) filter (where t.day = v_today),
         max(t.total) filter (where t.day = v_today - 1), bool_or(t.shown) filter (where t.day = v_today - 1),
         max(t.total) filter (where t.day = v_today - 7), bool_or(t.shown) filter (where t.day = v_today - 7),
         max(t.total) filter (where t.day = v_today - 30), bool_or(t.shown) filter (where t.day = v_today - 30)
    into v_t0, v_s0, v_t1, v_s1, v_t7, v_s7, v_t30, v_s30
    from fbla_private.fbla_account_totals(v_today - 29) t;
  v_new_month := v_t0 - v_t30;

  -- Onboarding: accounts that went on to make a profile, for all accounts and for those created in the last 30 days.
  -- With the account totals shown, these four numbers fix a 2 x 2 table (recent or older, profile or not), so each
  -- window is shown only when its cells are 0 or 5+, and both windows together only when every cell is.
  select count(*) filter (where a.created_at >= v_month and a.created_at < fbla_private.fbla_day_start(v_today + 1)
                                and exists (select 1 from public.fbla_profiles p where p.id = a.user_id)),
         count(*) filter (where a.created_at < fbla_private.fbla_day_start(v_today + 1)
                                and exists (select 1 from public.fbla_profiles p where p.id = a.user_id))
    into v_onb_month, v_onb_all
    from fbla_private.fbla_accounts() a;
  v_month_ok := v_s0 and v_s30
    and not (v_onb_month between 1 and 4)
    and not ((v_new_month - v_onb_month) between 1 and 4);
  v_all_ok := v_s0
    and not (v_onb_all between 1 and 4)
    and not ((v_t0 - v_onb_all) between 1 and 4)
    and (not v_month_ok
         or (not ((v_onb_all - v_onb_month) between 1 and 4)
             and not ((v_t30 - (v_onb_all - v_onb_month)) between 1 and 4)));

  select count(distinct x.user_id) filter (where x.ts >= v_day),
         count(distinct x.user_id) filter (where x.ts >= v_week),
         count(distinct x.user_id)
    into v_dau, v_wau, v_mau
    from fbla_private.fbla_activity(v_month, 'infinity') x;

  -- Returning: active in the last 30 days on two or more different days.
  select count(*) into v_returning
    from (select x.user_id
            from fbla_private.fbla_activity(v_month, 'infinity') x
           group by x.user_id
          having count(distinct fbla_private.fbla_local_day(x.ts)) >= 2) r;

  -- Questions answered: graded answer rows (official, chapter-written and duel questions), not attempt totals, which
  -- for a finished flashcard deck count cards.
  select count(distinct a.user_id), count(an.id)
    into v_answer_users, v_answered
    from public.fbla_attempts a
    join public.fbla_answers an on an.attempt_id = a.id
   where a.created_at >= v_week;

  -- Nested windows (rule 3): today, answering this week and returning sit inside this week or this month, and so do
  -- the accounts that finished sign-up this month (making a profile records an onboarding event).
  v_dau_c := fbla_private.fbla_count(v_dau);
  v_ans_c := fbla_private.fbla_count(v_answer_users);
  v_ret_c := fbla_private.fbla_count(v_returning);
  v_wau_c := fbla_private.fbla_count_over(v_wau,
    array[fbla_private.fbla_shown(v_dau_c), fbla_private.fbla_shown(v_ans_c)]);
  v_mau_c := fbla_private.fbla_count_over(v_mau,
    array[fbla_private.fbla_shown(v_dau_c), fbla_private.fbla_shown(v_ans_c), fbla_private.fbla_shown(v_wau_c),
          fbla_private.fbla_shown(v_ret_c), case when v_month_ok then v_onb_month end]);

  select min(e.created_at) into v_since from public.fbla_analytics_events e;

  return jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Toronto',
    'tracking_since', v_since,
    'accounts', fbla_private.fbla_count_if(v_t0, v_s0),
    'new_accounts', jsonb_build_object(
      'day', fbla_private.fbla_count_between(v_t0, v_s0, v_t1, v_s1),
      'week', fbla_private.fbla_count_between(v_t0, v_s0, v_t7, v_s7),
      'month', fbla_private.fbla_count_between(v_t0, v_s0, v_t30, v_s30)),
    'active', jsonb_build_object('dau', v_dau_c, 'wau', v_wau_c, 'mau', v_mau_c),
    'returning', v_ret_c,
    'returning_rate', fbla_private.fbla_rate(fbla_private.fbla_shown(v_ret_c), fbla_private.fbla_shown(v_mau_c)),
    'onboarding', jsonb_build_object(
      'month', jsonb_build_object(
        'created', fbla_private.fbla_count_between(v_t0, v_s0, v_t30, v_s30),
        'onboarded', fbla_private.fbla_count_if(v_onb_month, v_month_ok),
        'rate', case when v_month_ok and v_new_month > 0 then round(v_onb_month::numeric / v_new_month, 3) end),
      'all_time', jsonb_build_object(
        'created', fbla_private.fbla_count_if(v_t0, v_s0),
        'onboarded', fbla_private.fbla_count_if(v_onb_all, v_all_ok),
        'rate', case when v_all_ok and v_t0 > 0 then round(v_onb_all::numeric / v_t0, 3) end)),
    'answered_week', jsonb_build_object(
      'users', v_ans_c,
      'questions', case when fbla_private.fbla_shown(v_ans_c) is null then null else v_answered end));
end;
$$;

-- Growth: buckets of a day, week (Monday start) or month over the last p_days (7 to 400) Toronto days.
-- Per bucket: new FBLA accounts and the running account total at the end of the bucket (both from the shared totals,
-- rule 5), profiles created (onboarded), distinct users who practised (a graded run; a finished flashcard deck is not
-- one) and distinct active users. Practising and onboarded students sit inside the active ones, so the active count is
-- hidden when it is 1 to 4 above either (rule 3). `baseline` is the running total the day before the first bucket.
create or replace function public.fbla_owner_growth(p_days int default 90, p_bucket text default 'day')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 7), 400);
  v_bucket text := case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end;
  v_step interval;
  v_today date := fbla_private.fbla_local_day(now());
  v_first date;
  v_baseline jsonb;
  v_series jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_step := ('1 ' || v_bucket)::interval;
  v_first := v_today - (v_days - 1);

  with tot as materialized (
    select t.day, t.total, t.shown from fbla_private.fbla_account_totals(v_first) t
  ), b as (
    select greatest(g::date, v_first) as d_from,
           least((g + v_step)::date - 1, v_today) as d_to
      from generate_series(date_trunc(v_bucket, v_first::timestamp), v_today::timestamp, v_step) as g
  ), act as (
    select * from fbla_private.fbla_activity(fbla_private.fbla_day_start(v_first), 'infinity')
  ), n as (
    select b.d_from, b.d_to,
           (select count(*) from public.fbla_profiles p
             where p.created_at >= fbla_private.fbla_day_start(b.d_from)
               and p.created_at < fbla_private.fbla_day_start(b.d_to + 1)) as onboarded,
           (select count(distinct act.user_id) from act
             where act.ts >= fbla_private.fbla_day_start(b.d_from)
               and act.ts < fbla_private.fbla_day_start(b.d_to + 1)) as active,
           (select count(distinct a.user_id) from public.fbla_attempts a
             where a.created_at >= fbla_private.fbla_day_start(b.d_from)
               and a.created_at < fbla_private.fbla_day_start(b.d_to + 1)
               and not exists (select 1 from public.fbla_assignments s where s.id = a.assignment_id and s.kind = 'deck'))
             as practising
      from b
  ), c as (
    select n.d_from, n.d_to, n.active,
           fbla_private.fbla_count(n.onboarded) as onboarded_c,
           fbla_private.fbla_count(n.practising) as practising_c
      from n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'start', c.d_from,
           'end', c.d_to,
           'signups', fbla_private.fbla_count_between(t_end.total, t_end.shown, t_prev.total, t_prev.shown),
           'total', fbla_private.fbla_count_if(t_end.total, t_end.shown),
           'onboarded', c.onboarded_c,
           'active', fbla_private.fbla_count_over(c.active,
             array[fbla_private.fbla_shown(c.practising_c), fbla_private.fbla_shown(c.onboarded_c)]),
           'practising', c.practising_c
         ) order by c.d_from), '[]'::jsonb),
         (select fbla_private.fbla_count_if(t.total, t.shown) from tot t where t.day = v_first - 1)
    into v_series, v_baseline
    from c
    join tot t_end on t_end.day = c.d_to
    join tot t_prev on t_prev.day = c.d_from - 1;

  return jsonb_build_object('days', v_days, 'bucket', v_bucket, 'timezone', 'America/Toronto',
                            'baseline', v_baseline, 'series', v_series);
end;
$$;

-- Engagement over the last p_days (1 to 400): feature usage, practice modes, the practice funnel, duels, and which
-- FBLA events students open most.
create or replace function public.fbla_owner_engagement(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 400);
  v_from timestamptz := fbla_private.fbla_day_start(fbla_private.fbla_local_day(now()) - (v_days - 1));
  v_features jsonb;
  v_modes jsonb;
  v_popular jsonb;
  v_started_users bigint;
  v_started bigint;
  v_done_users bigint;
  v_done bigint;
  v_started_c jsonb;
  v_done_c jsonb;
  v_started_shown bigint;
  v_done_shown bigint;
  v_duel_users bigint;
  v_duels bigint;
  v_duels_done bigint;
  v_players_c jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Features, by the students who used each. Finished practice and mock exams are not here: Practice modes and the
  -- practice funnel cover them, and listing them twice would let one number be rebuilt from the others. Duels are left
  -- out for the same reason (the duels block covers them: students who started or finished a duel sit inside its
  -- players). The install and push events are left out until FBLA sends them. Hidden groups sort by name, not by
  -- their hidden size.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', n.name,
           'users', fbla_private.fbla_count(coalesce(s.users, 0)),
           'events', case when coalesce(s.users, 0) between 1 and 4 then null else coalesce(s.events, 0) end)
         order by case when coalesce(s.users, 0) between 1 and 4 then 0 else coalesce(s.users, 0) end desc, n.ord), '[]'::jsonb)
    into v_features
    from unnest(array[
      'event_selected', 'practice_started', 'vocab_session_completed', 'resource_opened', 'onboarding_completed',
      'feedback_submitted'
    ]) with ordinality as n(name, ord)
    left join (
      select e.event_name, count(distinct e.user_id) as users, count(*) as events
        from public.fbla_analytics_events e
       where e.created_at >= v_from
       group by e.event_name
    ) s on s.event_name = n.name;

  -- Practice modes from graded attempts (history before analytics existed is included): students per mode. Runs per
  -- mode are left out, since they add up to the funnel's finished total and would expose a hidden mode. A finished
  -- flashcard deck is not a graded run.
  select coalesce(jsonb_agg(jsonb_build_object('mode', m.kind, 'users', fbla_private.fbla_count(m.users))
         order by case when m.users between 1 and 4 then 0 else m.users end desc, m.kind), '[]'::jsonb)
    into v_modes
    from (select a.kind, count(distinct a.user_id) as users
            from public.fbla_attempts a
           where a.created_at >= v_from
             and not exists (select 1 from public.fbla_assignments s where s.id = a.assignment_id and s.kind = 'deck')
           group by a.kind) m;

  -- The funnel: runs started in the app (client event, RunPage) against graded runs (server events: every kind but
  -- duel; a finished flashcard deck records none, and the app never records a start for one).
  select count(distinct e.user_id) filter (where e.event_name = 'practice_started'),
         count(*) filter (where e.event_name = 'practice_started'),
         count(distinct e.user_id) filter (where e.event_name in ('practice_completed', 'exam_completed')),
         count(*) filter (where e.event_name in ('practice_completed', 'exam_completed'))
    into v_started_users, v_started, v_done_users, v_done
    from public.fbla_analytics_events e
   where e.created_at >= v_from;
  v_started_c := fbla_private.fbla_count(v_started_users);
  -- Students who finished include the students of each practice mode (rule 3).
  v_done_c := fbla_private.fbla_count_over(v_done_users,
    array(select fbla_private.fbla_shown(m -> 'users') from jsonb_array_elements(v_modes) m where m ->> 'mode' <> 'duel'));
  v_started_shown := case when fbla_private.fbla_shown(v_started_c) is null then null else v_started end;
  v_done_shown := case when fbla_private.fbla_shown(v_done_c) is null then null else v_done end;

  select count(distinct p.uid), count(distinct d.id), count(distinct d.id) filter (where d.status = 'complete')
    into v_duel_users, v_duels, v_duels_done
    from public.fbla_duels d
    cross join lateral (values (d.challenger_id), (d.opponent_id)) as p(uid)
   where d.created_at >= v_from;
  -- Students who played a duel run (the duel mode) sit inside the players (rule 3). The duel counts belong to the
  -- players, so they are hidden with them.
  v_players_c := fbla_private.fbla_count_over(v_duel_users,
    array(select fbla_private.fbla_shown(m -> 'users') from jsonb_array_elements(v_modes) m where m ->> 'mode' = 'duel'));

  -- Events students chose or started practising: real FBLA events only, students per event.
  select coalesce(jsonb_agg(t.obj order by t.sort_users desc, t.code), '[]'::jsonb)
    into v_popular
    from (
      select s.code,
             case when s.users between 1 and 4 then 0 else s.users end as sort_users,
             jsonb_build_object('code', s.code, 'users', fbla_private.fbla_count(s.users)) as obj
        from (select e.event_code as code, count(distinct e.user_id) as users
                from public.fbla_analytics_events e
               where e.created_at >= v_from and e.event_code is not null
                 and e.event_name in ('event_selected', 'practice_started')
                 and e.event_code in (select q.event from public.fbla_questions q)
               group by e.event_code) s
       order by case when s.users between 1 and 4 then 0 else s.users end desc, s.code
       limit 15
    ) t;

  return jsonb_build_object(
    'days', v_days,
    'features', v_features,
    'modes', v_modes,
    'practice', jsonb_build_object(
      'started', jsonb_build_object('users', v_started_c, 'events', v_started_shown),
      'completed', jsonb_build_object('users', v_done_c, 'events', v_done_shown),
      'completion_rate', case when v_started_shown > 0 and v_done_shown is not null
                              then round(least(1, v_done_shown::numeric / v_started_shown), 3) end),
    'duels', jsonb_build_object(
      'players', v_players_c,
      'created', case when fbla_private.fbla_shown(v_players_c) is null then null else v_duels end,
      'completed', case when fbla_private.fbla_shown(v_players_c) is null then null else v_duels_done end),
    'popular_events', v_popular);
end;
$$;

-- Preparation over the last p_days (1 to 400), one row per FBLA event. From the graded answers to that event's
-- official questions (chapter-written questions and duels left out): runs, distinct students, questions answered and
-- aggregate accuracy. A finished flashcard deck has no answer rows, so it never counts. Abandonment, the share of runs
-- started in the app and not finished, counts practice runs and mock exams only (not chapter tests or assignments,
-- whose starts and finishes the console reports under Engagement).
create or replace function public.fbla_owner_preparation(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 400);
  v_from timestamptz := fbla_private.fbla_day_start(fbla_private.fbla_local_day(now()) - (v_days - 1));
  v_rows jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(r.obj order by r.sort_users desc, r.event), '[]'::jsonb)
    into v_rows
    from (
      select ev.event,
             case when coalesce(a.users, 0) between 1 and 4 then 0 else coalesce(a.users, 0) end as sort_users,
             jsonb_build_object(
               'event', ev.event,
               'users', fbla_private.fbla_count(coalesce(a.users, 0)),
               'attempts', case when coalesce(a.users, 0) between 1 and 4 then null else coalesce(a.attempts, 0) end,
               'answered', case when coalesce(a.users, 0) between 1 and 4 then null else coalesce(a.answered, 0) end,
               'accuracy', case when coalesce(a.users, 0) >= 5 and coalesce(a.answered, 0) > 0
                                then round(a.correct::numeric / a.answered, 3) end,
               'started', fbla_private.fbla_count(coalesce(p.started_users, 0)),
               -- Shown only when 5+ started and the students who finished are not a hidden group of 1-4.
               'abandonment', case when coalesce(p.started_users, 0) >= 5
                                        and not (coalesce(p.done_users, 0) between 1 and 4)
                                        and coalesce(p.started, 0) > 0
                                   then round(greatest(0, 1 - least(1, coalesce(p.completed, 0)::numeric / p.started)), 3)
                              end) as obj
        from (select distinct q.event from public.fbla_questions q) ev
        left join (
          select an.event, count(distinct an.attempt_id) as attempts, count(distinct an.user_id) as users,
                 count(*) as answered, count(*) filter (where an.correct) as correct
            from public.fbla_answers an
            join public.fbla_attempts t on t.id = an.attempt_id
           where t.created_at >= v_from and t.kind <> 'duel'
             and an.question_id not like 'custom:%' and an.event is not null
           group by an.event
        ) a on a.event = ev.event
        left join (
          select e.event_code,
                 count(distinct e.user_id) filter (where e.event_name = 'practice_started') as started_users,
                 count(*) filter (where e.event_name = 'practice_started') as started,
                 count(distinct e.user_id) filter (where e.event_name in ('practice_completed', 'exam_completed')) as done_users,
                 count(*) filter (where e.event_name in ('practice_completed', 'exam_completed')) as completed
            from public.fbla_analytics_events e
           where e.created_at >= v_from and e.event_code is not null
             and e.event_name in ('practice_started', 'practice_completed', 'exam_completed')
             and coalesce(e.meta ->> 'mode', '') not in ('custom', 'assignment', 'duel')
           group by e.event_code
        ) p on p.event_code = ev.event
    ) r;

  return jsonb_build_object('days', v_days, 'events', v_rows);
end;
$$;

-- Content health: bank size per event, the questions students reported, and the official questions answered least
-- accurately (5+ distinct students), which is where a wrong key usually shows up first.
-- Report counts are exact: feedback is a support inbox the owner reads in full, not behavioural tracking.
create or replace function public.fbla_owner_content()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_events jsonb;
  v_reported jsonb;
  v_hardest jsonb;
  v_status jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event', x.event, 'questions', x.questions, 'areas', x.areas,
           'easy', x.easy, 'medium', x.medium, 'hard', x.hard, 'terms', x.terms) order by x.event), '[]'::jsonb)
    into v_events
    from (select q.event, count(*) as questions, count(distinct q.sub) as areas,
                 count(*) filter (where q.diff = 1) as easy,
                 count(*) filter (where q.diff = 2) as medium,
                 count(*) filter (where q.diff = 3) as hard,
                 (select count(*) from public.fbla_vocab_terms t where t.event = q.event) as terms
            from public.fbla_questions q
           group by q.event) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', r.question_id, 'event', r.event, 'area', r.sub, 'preview', r.preview,
           'reports', r.reports, 'open', r.open_reports, 'last_reported_at', r.last_at)
         order by r.open_reports desc, r.reports desc, r.question_id), '[]'::jsonb)
    into v_reported
    from (select f.question_id, q.event, q.sub, left(q.q, 160) as preview,
                 count(*) as reports,
                 count(*) filter (where f.status in ('new', 'triaged', 'in_progress')) as open_reports,
                 max(f.created_at) as last_at
            from public.fbla_feedback f
            left join public.fbla_questions q on q.id = f.question_id
           where f.kind = 'question_issue' and f.question_id is not null
           group by f.question_id, q.event, q.sub, q.q
           order by count(*) filter (where f.status in ('new', 'triaged', 'in_progress')) desc, count(*) desc
           limit 25) r;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', h.question_id, 'event', h.event, 'area', h.sub, 'preview', h.preview,
           'students', fbla_private.fbla_count(h.students), 'answers', h.answers, 'accuracy', h.accuracy)
         order by h.accuracy, h.answers desc), '[]'::jsonb)
    into v_hardest
    from (select a.question_id, q.event, q.sub, left(q.q, 160) as preview,
                 count(distinct a.user_id) as students, count(*) as answers,
                 round(avg(case when a.correct then 1 else 0 end)::numeric, 3) as accuracy
            from public.fbla_answers a
            join public.fbla_questions q on q.id = a.question_id
           group by a.question_id, q.event, q.sub, q.q
          having count(distinct a.user_id) >= 5
           order by avg(case when a.correct then 1 else 0 end), count(*) desc
           limit 10) h;

  select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
    into v_status
    from (select f.status, count(*) as n from public.fbla_feedback f group by f.status) s;

  return jsonb_build_object(
    'events', v_events,
    'reported_questions', v_reported,
    'hardest_questions', v_hardest,
    'feedback_status', v_status);
end;
$$;

revoke all on function public.fbla_owner_overview() from public, anon;
revoke all on function public.fbla_owner_growth(int, text) from public, anon;
revoke all on function public.fbla_owner_engagement(int) from public, anon;
revoke all on function public.fbla_owner_preparation(int) from public, anon;
revoke all on function public.fbla_owner_content() from public, anon;
grant execute on function public.fbla_owner_overview() to authenticated;
grant execute on function public.fbla_owner_growth(int, text) to authenticated;
grant execute on function public.fbla_owner_engagement(int) to authenticated;
grant execute on function public.fbla_owner_preparation(int) to authenticated;
grant execute on function public.fbla_owner_content() to authenticated;
