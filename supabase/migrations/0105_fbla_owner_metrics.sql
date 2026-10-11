-- 0105 FBLA owner metrics (Omega owner console). Ledger name: fbla_0105_owner_metrics.
--
-- Aggregate, read-only RPCs for the owner console. Every public function starts with the public.is_platform_owner()
-- check and runs as definer, so the underlying tables stay closed to clients.
--
-- Privacy rules:
--   * Small-group suppression: any count of distinct users from 1 to 4 comes back as {"value": null, "suppressed":
--     true}; 0 and 5+ come back exact. Totals tied to a suppressed bucket (event counts, accuracy) are nulled too.
--   * Rates are null unless the denominator is 5+ and neither the numerator nor the remainder is 1-4, so a rate can
--     never be multiplied back into a hidden count.
--   * No email, no free text, no per-user rows. Question previews (site content, never keys or explanations) appear
--     in content health.
--
-- Scope: FBLA and DECA share auth.users. An account counts for FBLA when it has an FBLA profile, or its sign-up
-- metadata says app = 'kcb-fbla' / 'fbla', or it carries no app marker (every account before DECA's backend).
-- DECA sign-ups must set raw_user_meta_data.app = 'deca' to stay out of these numbers.
--
-- Activity = an analytics event or a graded attempt. Days are America/Toronto calendar days.

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

-- FBLA-scoped accounts (see the scope note above).
create or replace function fbla_private.fbla_accounts()
returns table (user_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.created_at
    from auth.users u
   where not coalesce(u.is_anonymous, false)
     and (coalesce(u.raw_user_meta_data ->> 'app', 'kcb-fbla') in ('kcb-fbla', 'fbla')
          or exists (select 1 from public.fbla_profiles p where p.id = u.id));
$$;

-- Activity rows (one per analytics event or graded attempt) in [p_from, p_to).
create or replace function fbla_private.fbla_activity(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, ts timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, e.created_at from public.fbla_analytics_events e
   where e.created_at >= p_from and e.created_at < p_to
  union all
  select a.user_id, a.created_at from public.fbla_attempts a
   where a.created_at >= p_from and a.created_at < p_to;
$$;

revoke all on function fbla_private.fbla_count(bigint) from public, anon, authenticated;
revoke all on function fbla_private.fbla_rate(bigint, bigint) from public, anon, authenticated;
revoke all on function fbla_private.fbla_local_day(timestamptz) from public, anon, authenticated;
revoke all on function fbla_private.fbla_day_start(date) from public, anon, authenticated;
revoke all on function fbla_private.fbla_accounts() from public, anon, authenticated;
revoke all on function fbla_private.fbla_activity(timestamptz, timestamptz) from public, anon, authenticated;

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
  v_accounts bigint;
  v_profiles bigint;
  v_new_day bigint;
  v_new_week bigint;
  v_new_month bigint;
  v_onb_month bigint;
  v_onb_all bigint;
  v_dau bigint;
  v_wau bigint;
  v_mau bigint;
  v_returning bigint;
  v_answer_users bigint;
  v_answered bigint;
  v_since timestamptz;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*),
         count(*) filter (where a.created_at >= v_day),
         count(*) filter (where a.created_at >= v_week),
         count(*) filter (where a.created_at >= v_month),
         count(*) filter (where a.created_at >= v_month and exists (select 1 from public.fbla_profiles p where p.id = a.user_id)),
         count(*) filter (where exists (select 1 from public.fbla_profiles p where p.id = a.user_id))
    into v_accounts, v_new_day, v_new_week, v_new_month, v_onb_month, v_onb_all
    from fbla_private.fbla_accounts() a;

  select count(*) into v_profiles from public.fbla_profiles;

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

  select count(distinct a.user_id), coalesce(sum(a.total), 0)
    into v_answer_users, v_answered
    from public.fbla_attempts a
   where a.created_at >= v_week;

  select min(e.created_at) into v_since from public.fbla_analytics_events e;

  return jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Toronto',
    'tracking_since', v_since,
    'accounts', fbla_private.fbla_count(v_accounts),
    'profiles', fbla_private.fbla_count(v_profiles),
    'new_accounts', jsonb_build_object(
      'day', fbla_private.fbla_count(v_new_day),
      'week', fbla_private.fbla_count(v_new_week),
      'month', fbla_private.fbla_count(v_new_month)),
    'active', jsonb_build_object(
      'dau', fbla_private.fbla_count(v_dau),
      'wau', fbla_private.fbla_count(v_wau),
      'mau', fbla_private.fbla_count(v_mau)),
    'returning', fbla_private.fbla_count(v_returning),
    'returning_rate', fbla_private.fbla_rate(v_returning, v_mau),
    'onboarding', jsonb_build_object(
      'month', jsonb_build_object(
        'created', fbla_private.fbla_count(v_new_month),
        'onboarded', fbla_private.fbla_count(v_onb_month),
        'rate', fbla_private.fbla_rate(v_onb_month, v_new_month)),
      'all_time', jsonb_build_object(
        'created', fbla_private.fbla_count(v_accounts),
        'onboarded', fbla_private.fbla_count(v_onb_all),
        'rate', fbla_private.fbla_rate(v_onb_all, v_accounts))),
    'answered_week', jsonb_build_object(
      'users', fbla_private.fbla_count(v_answer_users),
      'questions', case when v_answer_users between 1 and 4 then null else v_answered end));
end;
$$;

-- Growth: buckets of a day, week (Monday start) or month over the last p_days (7 to 400) Toronto days.
-- Per bucket: new FBLA accounts, profiles created (onboarded), distinct active users, distinct users who practised,
-- and the running account total at the end of the bucket.
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
  v_series jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_step := ('1 ' || v_bucket)::interval;
  v_first := v_today - (v_days - 1);

  with b as (
    select greatest(g::date, v_first) as d_from,
           least((g + v_step)::date - 1, v_today) as d_to
      from generate_series(date_trunc(v_bucket, v_first::timestamp), v_today::timestamp, v_step) as g
  ), acc as (
    select * from fbla_private.fbla_accounts()
  ), act as (
    select * from fbla_private.fbla_activity(fbla_private.fbla_day_start(v_first), 'infinity')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'start', b.d_from,
           'end', b.d_to,
           'signups', fbla_private.fbla_count((
             select count(*) from acc
              where acc.created_at >= fbla_private.fbla_day_start(b.d_from)
                and acc.created_at < fbla_private.fbla_day_start(b.d_to + 1))),
           'onboarded', fbla_private.fbla_count((
             select count(*) from public.fbla_profiles p
              where p.created_at >= fbla_private.fbla_day_start(b.d_from)
                and p.created_at < fbla_private.fbla_day_start(b.d_to + 1))),
           'active', fbla_private.fbla_count((
             select count(distinct act.user_id) from act
              where act.ts >= fbla_private.fbla_day_start(b.d_from)
                and act.ts < fbla_private.fbla_day_start(b.d_to + 1))),
           'practising', fbla_private.fbla_count((
             select count(distinct a.user_id) from public.fbla_attempts a
              where a.created_at >= fbla_private.fbla_day_start(b.d_from)
                and a.created_at < fbla_private.fbla_day_start(b.d_to + 1))),
           'total', fbla_private.fbla_count((
             select count(*) from acc where acc.created_at < fbla_private.fbla_day_start(b.d_to + 1)))
         ) order by b.d_from), '[]'::jsonb)
    into v_series
    from b;

  return jsonb_build_object('days', v_days, 'bucket', v_bucket, 'timezone', 'America/Toronto', 'series', v_series);
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
  v_duel_users bigint;
  v_duels bigint;
  v_duels_done bigint;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', n.name,
           'users', fbla_private.fbla_count(coalesce(s.users, 0)),
           'events', case when coalesce(s.users, 0) between 1 and 4 then null else coalesce(s.events, 0) end)
         order by coalesce(s.users, 0) desc, n.ord), '[]'::jsonb)
    into v_features
    from unnest(array[
      'onboarding_completed', 'event_selected', 'practice_started', 'practice_completed', 'exam_completed',
      'vocab_session_completed', 'duel_started', 'duel_completed', 'resource_opened', 'feedback_submitted',
      'install_prompt_shown', 'app_installed', 'push_enabled'
    ]) with ordinality as n(name, ord)
    left join (
      select e.event_name, count(distinct e.user_id) as users, count(*) as events
        from public.fbla_analytics_events e
       where e.created_at >= v_from
       group by e.event_name
    ) s on s.event_name = n.name;

  -- Practice modes from graded attempts (history before analytics existed is included).
  select coalesce(jsonb_agg(jsonb_build_object(
           'mode', m.kind,
           'users', fbla_private.fbla_count(m.users),
           'attempts', case when m.users between 1 and 4 then null else m.attempts end)
         order by m.attempts desc, m.kind), '[]'::jsonb)
    into v_modes
    from (select a.kind, count(distinct a.user_id) as users, count(*) as attempts
            from public.fbla_attempts a
           where a.created_at >= v_from
           group by a.kind) m;

  select count(distinct e.user_id) filter (where e.event_name = 'practice_started'),
         count(*) filter (where e.event_name = 'practice_started'),
         count(distinct e.user_id) filter (where e.event_name in ('practice_completed', 'exam_completed')),
         count(*) filter (where e.event_name in ('practice_completed', 'exam_completed'))
    into v_started_users, v_started, v_done_users, v_done
    from public.fbla_analytics_events e
   where e.created_at >= v_from;

  select count(distinct p.uid), count(distinct d.id), count(distinct d.id) filter (where d.status = 'complete')
    into v_duel_users, v_duels, v_duels_done
    from public.fbla_duels d
    cross join lateral (values (d.challenger_id), (d.opponent_id)) as p(uid)
   where d.created_at >= v_from;

  select coalesce(jsonb_agg(t.obj order by t.users desc, t.code), '[]'::jsonb)
    into v_popular
    from (
      select s.code, s.users,
             jsonb_build_object(
               'code', s.code,
               'users', fbla_private.fbla_count(s.users),
               'events', case when s.users between 1 and 4 then null else s.events end) as obj
        from (select e.event_code as code, count(distinct e.user_id) as users, count(*) as events
                from public.fbla_analytics_events e
               where e.created_at >= v_from and e.event_code is not null
                 and e.event_name in ('event_selected', 'practice_started')
               group by e.event_code
               order by count(distinct e.user_id) desc, e.event_code
               limit 15) s
    ) t;

  return jsonb_build_object(
    'days', v_days,
    'features', v_features,
    'modes', v_modes,
    'practice', jsonb_build_object(
      'started', jsonb_build_object(
        'users', fbla_private.fbla_count(v_started_users),
        'events', case when v_started_users between 1 and 4 then null else v_started end),
      'completed', jsonb_build_object(
        'users', fbla_private.fbla_count(v_done_users),
        'events', case when v_done_users between 1 and 4 then null else v_done end),
      'completion_rate', case when v_started_users >= 5 and v_started > 0
                              then round(least(1, v_done::numeric / v_started), 3) end),
    'duels', jsonb_build_object(
      'players', fbla_private.fbla_count(v_duel_users),
      'created', case when v_duel_users between 1 and 4 then null else v_duels end,
      'completed', case when v_duel_users between 1 and 4 then null else v_duels_done end),
    'popular_events', v_popular);
end;
$$;

-- Preparation over the last p_days (1 to 400), one row per FBLA event: graded attempts, distinct students,
-- questions answered, aggregate accuracy, and abandonment (practice started but not completed).
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

  select coalesce(jsonb_agg(r.obj order by r.sort_users desc, r.sort_attempts desc, r.event), '[]'::jsonb)
    into v_rows
    from (
      select ev.event,
             coalesce(a.users, 0) as sort_users,
             coalesce(a.attempts, 0) as sort_attempts,
             jsonb_build_object(
               'event', ev.event,
               'users', fbla_private.fbla_count(coalesce(a.users, 0)),
               'attempts', case when coalesce(a.users, 0) between 1 and 4 then null else coalesce(a.attempts, 0) end,
               'answered', case when coalesce(a.users, 0) between 1 and 4 then null else coalesce(a.answered, 0) end,
               'accuracy', case when coalesce(a.users, 0) >= 5 and coalesce(a.answered, 0) > 0
                                then round(a.correct::numeric / a.answered, 3) end,
               'started', fbla_private.fbla_count(coalesce(p.started_users, 0)),
               'abandonment', case when coalesce(p.started_users, 0) >= 5 and coalesce(p.started, 0) > 0
                                   then round(greatest(0, 1 - least(1, coalesce(p.completed, 0)::numeric / p.started)), 3)
                              end) as obj
        from (select distinct q.event from public.fbla_questions q) ev
        left join (
          select t.event, count(*) as attempts, count(distinct t.user_id) as users,
                 sum(t.total) as answered, sum(t.correct) as correct
            from public.fbla_attempts t
           where t.created_at >= v_from and t.kind not in ('duel', 'custom') and t.event is not null
           group by t.event
        ) a on a.event = ev.event
        left join (
          select e.event_code,
                 count(distinct e.user_id) filter (where e.event_name = 'practice_started') as started_users,
                 count(*) filter (where e.event_name = 'practice_started') as started,
                 count(*) filter (where e.event_name in ('practice_completed', 'exam_completed')) as completed
            from public.fbla_analytics_events e
           where e.created_at >= v_from and e.event_code is not null
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
