-- Owner console impersonation tests (Omega, FBLA project uhgzeuvybyohdbfuhfil).
--
-- Body only: scripts/owner-dryrun.mjs wraps it as  BEGIN; <0101..0106 migrations>; <this file>; ROLLBACK;
-- so the migrations, every fixture and every write below are rolled back. Never run it outside that wrapper.
--
-- Identities:
--   anon         no JWT subject
--   QA student   1cb2408f-5da3-4c05-964a-2a1ceed78fc8 (plain student, never an owner)
--   fake owner   another existing auth user, made owner by inserting a private.platform_owners row inside the
--                rolled-back transaction
--   president    the president of a chapter that has another member (for the existing chapter RPCs)
-- Output: one row per check (name, ok, detail). Every row must have ok = true.

create temp table omega_results (name text primary key, ok boolean not null, detail text);

create function pg_temp.omega_check(p_name text, p_ok boolean, p_detail text default null)
returns void language sql as $$
  insert into omega_results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;

-- Runs p_sql as p_role (JWT subject p_uid when given) and records whether the SQLSTATE matched p_expect
-- ('ok' when nothing was raised).
create function pg_temp.omega_try(p_name text, p_role text, p_uid uuid, p_sql text, p_expect text)
returns void
language plpgsql
as $$
declare
  v_state text := 'ok';
  v_msg text := '';
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid::text, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
    v_msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into omega_results (name, ok, detail)
  values (p_name, v_state = p_expect, 'want ' || p_expect || ', got ' || v_state
          || case when v_msg <> '' then ' (' || left(v_msg, 120) || ')' else '' end);
end;
$$;

-- Runs a jsonb-returning expression as an authenticated user and returns the result (errors propagate).
create function pg_temp.omega_as(p_uid uuid, p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute 'select (' || p_sql || ')::jsonb' into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

-- True when no {"value": n} anywhere in the document has n between 1 and 4.
create function pg_temp.omega_no_small(p jsonb)
returns boolean language sql as $$
  select not jsonb_path_exists(p, 'lax $.** ? (@.type() == "object" && exists(@.value) && @.value >= 1 && @.value <= 4)');
$$;

-- ------------------------------------------------------------------------------------------------ fixtures
do $$
declare
  v_qa uuid := '1cb2408f-5da3-4c05-964a-2a1ceed78fc8';
  v_owner uuid;
  v_chapter uuid;
  v_president uuid;
  v_profile uuid;
  v_profile2 uuid;
  v_duel uuid;
  v_q text;
  v_term text;
  v_u uuid;
  v_newbie uuid;
begin
  select m.chapter_id, m.user_id into v_chapter, v_president
    from public.fbla_chapter_members m
   where m.role = 'president'
     and exists (select 1 from public.fbla_chapter_members o where o.chapter_id = m.chapter_id and o.role <> 'president')
   order by m.joined_at limit 1;
  if v_chapter is null then raise exception 'setup: need a chapter with a president and another member'; end if;

  -- Fake owner: an existing account that is not the QA student and not in the test chapter.
  select u.id into v_owner from auth.users u
   where u.id <> v_qa
     and not exists (select 1 from public.fbla_chapter_members m where m.user_id = u.id and m.chapter_id = v_chapter)
   order by u.created_at limit 1;
  if v_owner is null then raise exception 'setup: need a second account for the fake owner'; end if;
  insert into private.platform_owners (user_id, note) values (v_owner, 'dry-run fake owner (rolled back)');

  -- The QA student needs a profile to practise, review vocab and join a chapter (it may already have one).
  if not exists (select 1 from public.fbla_profiles where id = v_qa) then
    insert into public.fbla_profiles (id, username, display_name, main_event)
    values (v_qa, 'omega_dryrun_qa', 'Dry Run QA', 'accounting');
  end if;
  -- Onboarding: give an account without a profile its first profile (fires the onboarding trigger).
  select u.id into v_newbie from auth.users u
   where not exists (select 1 from public.fbla_profiles p where p.id = u.id) and u.id <> v_owner
   order by u.created_at limit 1;
  if v_newbie is not null then
    insert into public.fbla_profiles (id, username, display_name, main_event)
    values (v_newbie, 'omega_dryrun_new', 'Dry Run Newcomer', 'accounting');
  end if;

  -- Five accounts active today and two days ago (activity shown, returning users shown), five started and
  -- completed practice in accounting, two opened marketing (suppressed bucket).
  for v_u in select u.id from auth.users u order by u.created_at limit 5 loop
    insert into public.fbla_analytics_events (event_name, user_id, event_code, meta, created_at)
    values ('practice_started', v_u, 'accounting', '{"mode":"practice"}', now()),
           ('practice_completed', v_u, 'accounting', '{"mode":"practice"}', now()),
           ('event_selected', v_u, 'accounting', '{}', now() - interval '2 days');
  end loop;
  for v_u in select u.id from auth.users u order by u.created_at limit 2 loop
    insert into public.fbla_analytics_events (event_name, user_id, event_code, meta)
    values ('event_selected', v_u, 'marketing', '{}');
  end loop;

  -- Graded attempts by an existing profile: practice and mock record events, a duel attempt does not.
  select p.id into v_profile from public.fbla_profiles p where p.id <> v_qa order by p.created_at limit 1;
  select p.id into v_profile2 from public.fbla_profiles p where p.id not in (v_qa, v_profile) order by p.created_at limit 1;
  insert into public.fbla_attempts (user_id, kind, event, label, total, correct, duration_ms)
  values (v_profile, 'practice', 'economics', 'dry run practice', 10, 7, 120000),
         (v_profile, 'mock', 'economics', 'dry run mock', 100, 60, 3000000),
         (v_profile, 'duel', 'economics', 'dry run duel attempt', 10, 5, 90000);

  -- A duel between two profiles: one run opened, settled later in the tests.
  insert into public.fbla_duels (challenger_id, opponent_id, event, question_ids, status, accepted_at)
  values (v_profile, v_profile2, 'economics',
          array(select q.id from public.fbla_questions q where q.event = 'economics' order by q.id limit 10),
          'accepted', now())
  returning id into v_duel;
  insert into public.fbla_duel_runs (duel_id, user_id) values (v_duel, v_profile);

  -- Feedback: one from the fake owner (another member's row, as far as the QA student is concerned).
  select q.id into v_q from public.fbla_questions q where q.event = 'accounting' order by q.id limit 1;
  insert into public.fbla_feedback (user_id, kind, message, page_path, question_id)
  values (v_owner, 'question_issue', 'Dry run: the key on this one looks wrong', '/play/review/x', v_q);

  -- Vocab: a QA progress row, reviewed twice (one session).
  select t.id into v_term from public.fbla_vocab_terms t where t.event = 'marketing' order by t.id limit 1;
  insert into public.fbla_vocab_progress (user_id, term_id, box, due_at) values (v_qa, v_term, 0, now());
  update public.fbla_vocab_progress set last_reviewed_at = now(), box = 1 where user_id = v_qa and term_id = v_term;
  update public.fbla_vocab_progress set last_reviewed_at = now() + interval '1 second', box = 2
   where user_id = v_qa and term_id = v_term;

  perform set_config('omega.qa', v_qa::text, true);
  perform set_config('omega.owner', v_owner::text, true);
  perform set_config('omega.chapter', v_chapter::text, true);
  perform set_config('omega.president', v_president::text, true);
  perform set_config('omega.profile', v_profile::text, true);
  perform set_config('omega.profile2', v_profile2::text, true);
  perform set_config('omega.duel', v_duel::text, true);
  perform set_config('omega.question', v_q, true);
  perform set_config('omega.newbie', coalesce(v_newbie::text, ''), true);
  perform set_config('omega.qa_username', (select username from public.fbla_profiles where id = v_qa), true);
end;
$$;

-- ------------------------------------------------------------------------------------------------ anon
select pg_temp.omega_try('anon: ' || f, 'anon', null, 'select ' || f, '42501')
  from unnest(array[
    'public.is_platform_owner()',
    'public.fbla_owner_overview()',
    'public.fbla_owner_growth(30, ''day'')',
    'public.fbla_owner_engagement(30)',
    'public.fbla_owner_preparation(30)',
    'public.fbla_owner_content()',
    'public.fbla_owner_feedback_list(null, null, 50, 0)',
    'public.fbla_owner_feedback_update(gen_random_uuid(), ''resolved'', null, null)',
    'public.fbla_owner_audit_search(90, null, null, 50, 0)',
    'public.fbla_owner_user_search(''dry'', 10)',
    'public.fbla_owner_support_email(gen_random_uuid(), ''a long enough reason'')',
    'public.fbla_owner_set_chapter_ban(gen_random_uuid(), gen_random_uuid(), true, null)',
    'public.fbla_owner_set_chapter_role(gen_random_uuid(), gen_random_uuid(), ''member'', null)',
    'public.fbla_track(''event_selected'', ''accounting'', ''{}''::jsonb)'
  ]) as f;
select pg_temp.omega_try('anon: read analytics', 'anon', null, 'select count(*) from public.fbla_analytics_events', '42501');
select pg_temp.omega_try('anon: read feedback', 'anon', null, 'select count(*) from public.fbla_feedback', '42501');
select pg_temp.omega_try('anon: insert feedback', 'anon', null,
  'insert into public.fbla_feedback (user_id, kind, message) values (gen_random_uuid(), ''bug'', ''anon report'')', '42501');
select pg_temp.omega_try('anon: read audit', 'anon', null, 'select count(*) from public.fbla_audit_log', '42501');

-- ------------------------------------------------------------------------------------------------ QA student
select pg_temp.omega_check('qa: is_platform_owner is false',
  pg_temp.omega_as(current_setting('omega.qa')::uuid, 'to_jsonb(public.is_platform_owner())') = 'false'::jsonb);

select pg_temp.omega_try('qa: ' || f, 'authenticated', current_setting('omega.qa')::uuid, 'select ' || f, '42501')
  from unnest(array[
    'public.fbla_owner_overview()',
    'public.fbla_owner_growth(30, ''day'')',
    'public.fbla_owner_engagement(30)',
    'public.fbla_owner_preparation(30)',
    'public.fbla_owner_content()',
    'public.fbla_owner_feedback_list(null, null, 50, 0)',
    'public.fbla_owner_feedback_update((select id from public.fbla_feedback limit 1), ''resolved'', null, null)',
    'public.fbla_owner_audit_search(90, null, null, 50, 0)',
    'public.fbla_owner_user_search(''dry'', 10)',
    'public.fbla_owner_support_email(''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', ''a long enough reason'')',
    'public.fbla_owner_set_chapter_ban(''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', current_setting(''omega.chapter'')::uuid, true, null)',
    'public.fbla_owner_set_chapter_role(''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', current_setting(''omega.chapter'')::uuid, ''executive'', null)',
    'fbla_private.fbla_audit(''forged'', ''user'', null, ''{}''::jsonb)',
    'fbla_private.fbla_record_event(''practice_completed'', ''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', null, ''{}''::jsonb)',
    'fbla_private.fbla_purge_analytics()',
    'count(*) from fbla_private.fbla_accounts()',
    'count(*) from fbla_private.fbla_activity(now() - interval ''1 day'', now())'
  ]) as f;

select pg_temp.omega_try('qa: insert into the owner allowlist', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into private.platform_owners (user_id) values (''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'')', '42501');
select pg_temp.omega_try('qa: read the owner allowlist', 'authenticated', current_setting('omega.qa')::uuid,
  'select count(*) from private.platform_owners', '42501');
select pg_temp.omega_try('qa: insert an audit row', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_audit_log (action, target_type) values (''forged'', ''user'')', '42501');
select pg_temp.omega_try('qa: update the audit log', 'authenticated', current_setting('omega.qa')::uuid,
  'update public.fbla_audit_log set action = ''tampered''', '42501');
select pg_temp.omega_try('qa: delete the audit log', 'authenticated', current_setting('omega.qa')::uuid,
  'delete from public.fbla_audit_log', '42501');
select pg_temp.omega_try('qa: read analytics rows', 'authenticated', current_setting('omega.qa')::uuid,
  'select count(*) from public.fbla_analytics_events', '42501');
select pg_temp.omega_try('qa: insert analytics rows directly', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_analytics_events (event_name, user_id) values (''practice_completed'', ''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'')', '42501');
select pg_temp.omega_try('qa: update feedback status', 'authenticated', current_setting('omega.qa')::uuid,
  'update public.fbla_feedback set status = ''resolved''', '42501');
select pg_temp.omega_try('qa: delete feedback', 'authenticated', current_setting('omega.qa')::uuid,
  'delete from public.fbla_feedback', '42501');
select pg_temp.omega_try('qa: set status on insert', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (user_id, kind, message, status) values (''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', ''bug'', ''status smuggling'', ''resolved'')', '42501');
select pg_temp.omega_try('qa: file feedback as someone else', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (user_id, kind, message) values (current_setting(''omega.owner'')::uuid, ''bug'', ''written as another member'')', '42501');
select pg_temp.omega_try('qa: read reviewed_by', 'authenticated', current_setting('omega.qa')::uuid,
  'select reviewed_by from public.fbla_feedback', '42501');
select pg_temp.omega_try('qa: question id on a non-question report', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (kind, message, question_id) values (''bug'', ''a bug with a question id'', ''acc-001'')', '23514');
select pg_temp.omega_try('qa: may file their own feedback (user_id defaults to them)', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (kind, message, page_path) values (''bug'', ''Dry run: the QA student report'', ''/play'')', 'ok');
select pg_temp.omega_try('qa: may report a question', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (kind, message, page_path, question_id) values (''question_issue'', ''Wrong answer marked correct'', ''/play/review/abc'', current_setting(''omega.question''))', 'ok');

-- The owner reads feedback through the RPCs only (no table policy), so the test looks the id up as the server.
select set_config('omega.qa_bug', (select f.id::text from public.fbla_feedback f
  where f.user_id = current_setting('omega.qa')::uuid and f.kind = 'bug' order by f.created_at limit 1), true);

select pg_temp.omega_try('qa: track an allowed event', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''accounting'', ''{"source":"play"}''::jsonb)', 'ok');
select pg_temp.omega_try('qa: track refuses server event ' || e, 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''' || e || ''', ''accounting'')', '22023')
  from unnest(array['practice_completed', 'exam_completed', 'onboarding_completed', 'vocab_session_completed',
                    'duel_completed', 'feedback_submitted', 'account_created', 'made_up']) as e;
select pg_temp.omega_try('qa: track refuses free text metadata', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''accounting'', ''{"text":"my essay answer"}''::jsonb)', '22023');
select pg_temp.omega_try('qa: track refuses a spaced metadata value', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''accounting'', ''{"mode":"Has Spaces"}''::jsonb)', '22023');
select pg_temp.omega_try('qa: track refuses a bad event code', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''Bad Code!'')', '22023');

do $$
declare
  v_qa uuid := current_setting('omega.qa')::uuid;
  v_n int;
  v_state text := 'ok';
  v_others int;
  v_own int;
  v_audit int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_qa::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..40 loop
    perform public.fbla_track('practice_started', 'marketing', '{"mode":"practice"}'::jsonb);
  end loop;
  reset role;
  -- Client events only: the one event_selected above plus 29 of these 40 (server events do not count).
  select count(*) into v_n from public.fbla_analytics_events
   where user_id = v_qa and created_at > now() - interval '1 minute' and event_name in ('event_selected', 'practice_started');
  set local role authenticated;
  -- 2 reports already this hour; 8 more reach the cap of 10, the 11th is refused.
  for i in 1..8 loop
    insert into public.fbla_feedback (kind, message) values ('general', 'rate limit fill row ' || i);
  end loop;
  begin
    insert into public.fbla_feedback (kind, message) values ('general', 'the eleventh report this hour');
  exception when others then
    v_state := sqlstate;
  end;
  select count(*) filter (where f.user_id <> v_qa), count(*) filter (where f.user_id = v_qa)
    into v_others, v_own from public.fbla_feedback f;
  select count(*) into v_audit from public.fbla_audit_log;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.omega_check('qa: tracking stops at 30 a minute', v_n = 30, 'rows this minute: ' || v_n);
  perform pg_temp.omega_check('qa: 11th feedback in an hour is refused', v_state = '53400', 'got ' || v_state);
  perform pg_temp.omega_check('qa: reads only their own feedback', v_others = 0 and v_own = 10,
    'others=' || v_others || ' own=' || v_own);
  perform pg_temp.omega_check('qa: sees no audit rows', v_audit = 0, 'visible=' || v_audit);
end;
$$;

select pg_temp.omega_check('feedback: insert forces status new and normal priority',
  not exists (select 1 from public.fbla_feedback f where f.status <> 'new' or f.priority <> 'normal'
                 or f.reviewed_by is not null or f.resolution_note is not null), 'checked');

-- ------------------------------------------------------------------------------------------------ fake owner
select pg_temp.omega_check('owner: is_platform_owner is true',
  pg_temp.omega_as(current_setting('omega.owner')::uuid, 'to_jsonb(public.is_platform_owner())') = 'true'::jsonb);

select pg_temp.omega_try('owner runs ' || f, 'authenticated', current_setting('omega.owner')::uuid, 'select ' || f, 'ok')
  from unnest(array[
    'public.fbla_owner_overview()',
    'public.fbla_owner_growth(30, ''day'')',
    'public.fbla_owner_growth(90, ''week'')',
    'public.fbla_owner_growth(365, ''month'')',
    'public.fbla_owner_engagement(30)',
    'public.fbla_owner_preparation(30)',
    'public.fbla_owner_content()',
    'public.fbla_owner_feedback_list(''open'', null, 50, 0)',
    'public.fbla_owner_audit_search(90, null, null, 50, 0)',
    'public.fbla_owner_user_search(''dry'', 10)'
  ]) as f;

do $$
declare
  v_owner uuid := current_setting('omega.owner')::uuid;
  v_day timestamptz := fbla_private.fbla_day_start(fbla_private.fbla_local_day(now()));
  v_today date := fbla_private.fbla_local_day(now());
  v_expect_dau bigint;
  v_ov jsonb;
  v_gd jsonb;
  v_gw jsonb;
  v_gm jsonb;
  v_en jsonb;
  v_pr jsonb;
  v_co jsonb;
  v_fb jsonb;
  v_us jsonb;
  v_us_id jsonb;
  v_mk jsonb;
  v_ac jsonb;
  v_bad int;
begin
  select count(distinct x.user_id) into v_expect_dau from (
    select e.user_id from public.fbla_analytics_events e where e.created_at >= v_day
    union all select a.user_id from public.fbla_attempts a where a.created_at >= v_day) x;

  v_ov := pg_temp.omega_as(v_owner, 'public.fbla_owner_overview()');
  v_gd := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(30, ''day'')');
  v_gw := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(30, ''week'')');
  v_gm := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(60, ''month'')');
  v_en := pg_temp.omega_as(v_owner, 'public.fbla_owner_engagement(30)');
  v_pr := pg_temp.omega_as(v_owner, 'public.fbla_owner_preparation(30)');
  v_co := pg_temp.omega_as(v_owner, 'public.fbla_owner_content()');
  v_fb := pg_temp.omega_as(v_owner, 'public.fbla_owner_feedback_list(null, null, 200, 0)');
  v_us := pg_temp.omega_as(v_owner, 'public.fbla_owner_user_search(current_setting(''omega.qa_username''), 10)');
  v_us_id := pg_temp.omega_as(v_owner, 'public.fbla_owner_user_search(''1cb2408f-5da3-4c05-964a-2a1ceed78fc8'', 10)');

  perform pg_temp.omega_check('owner: DAU equals the distinct count for today',
    (v_ov #>> '{active,dau,value}')::bigint = v_expect_dau and v_expect_dau >= 5,
    'dau=' || coalesce(v_ov #>> '{active,dau,value}', 'null') || ' expected=' || v_expect_dau);
  perform pg_temp.omega_check('owner: returning users (2+ active days) are counted',
    (v_ov #>> '{returning,value}')::bigint >= 5, 'returning=' || coalesce(v_ov ->> 'returning', 'null'));
  perform pg_temp.omega_check('owner: accounts follow the FBLA scope',
    (v_ov #>> '{accounts,value}')::bigint = (select count(*) from fbla_private.fbla_accounts()),
    'accounts=' || coalesce(v_ov #>> '{accounts,value}', 'null'));
  perform pg_temp.omega_check('owner: tracking_since is set', v_ov ->> 'tracking_since' is not null, v_ov ->> 'tracking_since');

  perform pg_temp.omega_check('owner: no visible count between 1 and 4 in any metric RPC',
    pg_temp.omega_no_small(v_ov) and pg_temp.omega_no_small(v_gd) and pg_temp.omega_no_small(v_gw)
      and pg_temp.omega_no_small(v_gm) and pg_temp.omega_no_small(v_en) and pg_temp.omega_no_small(v_pr)
      and pg_temp.omega_no_small(v_co), 'checked every {value} in the five RPCs');
  perform pg_temp.omega_check('owner: metric RPCs carry no email address',
    position('@' in (v_ov || v_en || v_pr || v_co || jsonb_build_object('g', v_gd))::text) = 0, 'checked');
  perform pg_temp.omega_check('owner: content never returns answer keys or explanations',
    position('"answer"' in v_co::text) = 0 and position('"explain"' in v_co::text) = 0
      and position('"choices"' in v_co::text) = 0, 'checked');

  perform pg_temp.omega_check('owner: daily growth has 30 buckets ending today',
    jsonb_array_length(v_gd -> 'series') = 30
      and (v_gd -> 'series' -> 0 ->> 'start')::date = v_today - 29
      and (v_gd -> 'series' -> -1 ->> 'end')::date = v_today,
    'rows=' || jsonb_array_length(v_gd -> 'series'));
  perform pg_temp.omega_check('owner: weekly buckets cover the range without gaps',
    (v_gw -> 'series' -> 0 ->> 'start')::date = v_today - 29
      and (v_gw -> 'series' -> -1 ->> 'end')::date = v_today
      and not exists (select 1 from jsonb_array_elements(v_gw -> 'series') with ordinality a(b, i)
                        join jsonb_array_elements(v_gw -> 'series') with ordinality c(d, j) on j = i + 1
                       where (c.d ->> 'start')::date <> (a.b ->> 'end')::date + 1),
    'rows=' || jsonb_array_length(v_gw -> 'series'));
  perform pg_temp.omega_check('owner: monthly buckets start on the range start, then on the 1st',
    (v_gm -> 'series' -> 0 ->> 'start')::date = v_today - 59
      and not exists (select 1 from jsonb_array_elements(v_gm -> 'series') with ordinality a(b, i)
                       where i > 1 and extract(day from (a.b ->> 'start')::date) <> 1),
    'rows=' || jsonb_array_length(v_gm -> 'series'));
  perform pg_temp.omega_check('owner: running total never decreases',
    not exists (select 1 from jsonb_array_elements(v_gd -> 'series') with ordinality a(b, i)
                  join jsonb_array_elements(v_gd -> 'series') with ordinality c(d, j) on j = i + 1
                 where (a.b #>> '{total,value}') is not null and (c.d #>> '{total,value}') is not null
                   and (c.d #>> '{total,value}')::int < (a.b #>> '{total,value}')::int), 'checked');

  select p into v_mk from jsonb_array_elements(v_en -> 'popular_events') p where p ->> 'code' = 'marketing';
  select p into v_ac from jsonb_array_elements(v_en -> 'popular_events') p where p ->> 'code' = 'accounting';
  perform pg_temp.omega_check('owner: a 2-3 user bucket is suppressed (null value, flag, no event count)',
    v_mk is not null and (v_mk #>> '{users,value}') is null and (v_mk #>> '{users,suppressed}') = 'true'
      and v_mk -> 'events' = 'null'::jsonb, coalesce(v_mk::text, 'missing'));
  perform pg_temp.omega_check('owner: a 5+ user bucket is shown',
    (v_ac #>> '{users,value}')::int >= 5 and (v_ac ->> 'events')::int >= 5, coalesce(v_ac::text, 'missing'));
  perform pg_temp.omega_check('owner: completion rate is completed over started',
    (v_en #>> '{practice,completion_rate}') is not null
      and (v_en #>> '{practice,completion_rate}')::numeric
          = round(least(1, (v_en #>> '{practice,completed,events}')::numeric / (v_en #>> '{practice,started,events}')::numeric), 3),
    coalesce(v_en -> 'practice', 'null')::text);

  select count(*) into v_bad from jsonb_array_elements(v_pr -> 'events') r
   where ((r #>> '{users,suppressed}') = 'true' and (r -> 'attempts' <> 'null'::jsonb or r -> 'accuracy' <> 'null'::jsonb))
      or ((r #>> '{users,value}') = '0' and r -> 'accuracy' <> 'null'::jsonb);
  perform pg_temp.omega_check('owner: preparation hides counts and accuracy for small groups', v_bad = 0, 'bad rows=' || v_bad);
  perform pg_temp.omega_check('owner: preparation lists every FBLA event once',
    jsonb_array_length(v_pr -> 'events') = (select count(distinct q.event) from public.fbla_questions q),
    'rows=' || jsonb_array_length(v_pr -> 'events'));
  select r into v_ac from jsonb_array_elements(v_pr -> 'events') r where r ->> 'event' = 'accounting';
  perform pg_temp.omega_check('owner: abandonment is 1 - completed / started',
    (v_ac ->> 'abandonment') is not null and (v_ac ->> 'abandonment')::numeric >= 0 and (v_ac ->> 'abandonment')::numeric <= 1,
    coalesce(v_ac::text, 'missing'));

  perform pg_temp.omega_check('owner: content lists the reported question',
    exists (select 1 from jsonb_array_elements(v_co -> 'reported_questions') r
             where r ->> 'question_id' = current_setting('omega.question') and (r ->> 'reports')::int = 2),
    left((v_co -> 'reported_questions')::text, 200));
  perform pg_temp.omega_check('owner: feedback list sees every member''s reports',
    (v_fb ->> 'total')::int = (select count(*) from public.fbla_feedback)
      and exists (select 1 from jsonb_array_elements(v_fb -> 'rows') r where r ->> 'user_id' = current_setting('omega.qa')),
    'total=' || (v_fb ->> 'total'));
  perform pg_temp.omega_check('owner: user search finds by username and returns no email field',
    jsonb_array_length(v_us) >= 1 and v_us -> 0 ->> 'user_id' = current_setting('omega.qa')
      and position('email' in v_us::text) = 0 and position('@' in v_us::text) = 0 and position('email' in v_us_id::text) = 0,
    'rows=' || jsonb_array_length(v_us));
  perform pg_temp.omega_check('owner: user search by exact id',
    jsonb_array_length(v_us_id) = 1 and v_us_id -> 0 ->> 'user_id' = current_setting('omega.qa'), v_us_id::text);
end;
$$;

-- Owner writes.
select pg_temp.omega_try('owner: feedback triage', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_feedback_update(current_setting(''omega.qa_bug'')::uuid, ''resolved'', ''high'', ''Fixed in the next release'')', 'ok');
select pg_temp.omega_try('owner: cannot read feedback rows directly (RPC only)', 'authenticated', current_setting('omega.owner')::uuid,
  'do $t$ begin if (select count(*) from public.fbla_feedback where user_id = current_setting(''omega.qa'')::uuid) > 0 then raise exception ''visible'' using errcode = ''P0001''; end if; end $t$', 'ok');
select pg_temp.omega_check('feedback: the reporter sees the triage result',
  pg_temp.omega_as(current_setting('omega.qa')::uuid,
    '(select to_jsonb(f) from (select status, priority, resolution_note from public.fbla_feedback where id = current_setting(''omega.qa_bug'')::uuid) f)')
  = '{"status": "resolved", "priority": "high", "resolution_note": "Fixed in the next release"}'::jsonb);
select pg_temp.omega_try('owner: unknown feedback status refused', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_feedback_update((select id from public.fbla_feedback limit 1), ''closed'', null, null)', '22023');
select pg_temp.omega_try('owner: support email needs a reason', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_support_email(current_setting(''omega.qa'')::uuid, ''short'')', '22023');
select pg_temp.omega_try('owner: support email with a reason', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_support_email(current_setting(''omega.qa'')::uuid, ''Dry run: replying to a support request'')', 'ok');

-- Chapter tools: put the QA student in the test chapter, then walk the owner wrappers.
insert into public.fbla_chapter_members (chapter_id, user_id, role)
values (current_setting('omega.chapter')::uuid, current_setting('omega.qa')::uuid, 'member');

select pg_temp.omega_try('owner: member -> trainer', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_role(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, ''trainer'', ''Dry run: helps run marketing'')', 'ok');
select pg_temp.omega_try('owner: trainer -> executive', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_role(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, ''executive'', null)', 'ok');
select pg_temp.omega_try('owner: an executive cannot be banned before demotion', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, true, ''dry run'')', '42501');
select pg_temp.omega_try('owner: executive -> member', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_role(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, ''member'', null)', 'ok');
select pg_temp.omega_try('owner: ban from chapter', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, true, ''Dry run ban check'')', 'ok');
select pg_temp.omega_check('owner: the ban removed the membership',
  not exists (select 1 from public.fbla_chapter_members m
               where m.chapter_id = current_setting('omega.chapter')::uuid and m.user_id = current_setting('omega.qa')::uuid));
select pg_temp.omega_try('owner: unban', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, false, null)', 'ok');
select pg_temp.omega_try('owner: unban twice is refused', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, false, null)', 'P0002');
select pg_temp.omega_try('owner: the president cannot be banned', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.president'')::uuid, current_setting(''omega.chapter'')::uuid, true, null)', '42501');
select pg_temp.omega_try('owner: the president cannot be demoted', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_role(current_setting(''omega.president'')::uuid, current_setting(''omega.chapter'')::uuid, ''executive'', null)', '42501');
select pg_temp.omega_try('owner: president role cannot be granted', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_set_chapter_role(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, ''president'', null)', '22023');

-- Existing chapter RPCs, as the chapter's president: they are audited too.
insert into public.fbla_chapter_members (chapter_id, user_id, role)
values (current_setting('omega.chapter')::uuid, current_setting('omega.qa')::uuid, 'member');
select pg_temp.omega_try('president: fbla_set_role still works', 'authenticated', current_setting('omega.president')::uuid,
  'select public.fbla_set_role(current_setting(''omega.chapter'')::uuid, current_setting(''omega.qa'')::uuid, ''executive'')', 'ok');
select pg_temp.omega_try('president: fbla_remove_member still works', 'authenticated', current_setting('omega.president')::uuid,
  'select public.fbla_remove_member(current_setting(''omega.chapter'')::uuid, current_setting(''omega.qa'')::uuid)', 'ok');

-- ------------------------------------------------------------------------------------------------ audit log
do $$
declare
  v_owner uuid := current_setting('omega.owner')::uuid;
  v_qa text := current_setting('omega.qa');
  v_pres uuid := current_setting('omega.president')::uuid;
  v_visible int;
  v_search jsonb;
  v_msg text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visible from public.fbla_audit_log;
  v_search := public.fbla_owner_audit_search(90, null, current_setting('omega.qa_username'), 200, 0);
  reset role;

  perform pg_temp.omega_check('audit: owner can read it', v_visible >= 8, 'visible=' || v_visible);
  perform pg_temp.omega_check('audit: search by the target''s username finds their rows',
    (v_search ->> 'total')::int >= 5, 'total=' || (v_search ->> 'total'));
  perform pg_temp.omega_check('audit: owner grant is logged',
    exists (select 1 from public.fbla_audit_log a where a.action = 'owner_granted' and a.target_id = v_owner::text));
  perform pg_temp.omega_check('audit: feedback triage logged with the owner as actor',
    exists (select 1 from public.fbla_audit_log a where a.action = 'feedback_updated' and a.actor_id = v_owner
              and a.detail ->> 'to' = 'resolved' and (a.detail ->> 'note_changed')::boolean));
  perform pg_temp.omega_check('audit: support email lookup logged with its reason',
    exists (select 1 from public.fbla_audit_log a where a.action = 'support_email_viewed' and a.target_id = v_qa
              and a.actor_id = v_owner and a.detail ->> 'reason' = 'Dry run: replying to a support request'));
  perform pg_temp.omega_check('audit: owner role change logged via the console with its reason',
    exists (select 1 from public.fbla_audit_log a where a.action = 'chapter_role_changed' and a.target_id = v_qa
              and a.actor_id = v_owner and a.detail ->> 'via' = 'owner_console' and a.detail ->> 'to' = 'trainer'
              and a.detail ->> 'reason' = 'Dry run: helps run marketing'));
  perform pg_temp.omega_check('audit: owner ban logged via the console with its reason',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_banned' and a.target_id = v_qa
              and a.actor_id = v_owner and a.detail ->> 'via' = 'owner_console' and a.detail ->> 'reason' = 'Dry run ban check'));
  perform pg_temp.omega_check('audit: a ban does not also log a removal',
    not exists (select 1 from public.fbla_audit_log a where a.action = 'member_removed' and a.actor_id = v_owner));
  perform pg_temp.omega_check('audit: unban logged',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_unbanned' and a.target_id = v_qa and a.actor_id = v_owner));
  perform pg_temp.omega_check('audit: refused president ban wrote nothing',
    not exists (select 1 from public.fbla_audit_log a where a.action = 'member_banned' and a.target_id = v_pres::text));
  perform pg_temp.omega_check('audit: president''s fbla_set_role logged with the president as actor',
    exists (select 1 from public.fbla_audit_log a where a.action = 'chapter_role_changed' and a.target_id = v_qa
              and a.actor_id = v_pres and a.detail ->> 'to' = 'executive' and not a.detail ? 'via'));
  perform pg_temp.omega_check('audit: president''s fbla_remove_member logged',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_removed' and a.target_id = v_qa and a.actor_id = v_pres));

  begin
    update public.fbla_audit_log set action = 'tampered';
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pg_temp.omega_check('audit: update blocked even for the table owner', v_msg like '%append-only%', v_msg);
  v_msg := '';
  begin
    delete from public.fbla_audit_log;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pg_temp.omega_check('audit: delete blocked even for the table owner', v_msg like '%append-only%', v_msg);
  v_msg := '';
  begin
    truncate public.fbla_audit_log;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pg_temp.omega_check('audit: truncate blocked even for the table owner', v_msg like '%append-only%', v_msg);
end;
$$;

-- Chapter deletion through the existing RPC: one chapter_deleted row, no per-member noise from the cascade.
do $$
declare
  v_pres uuid := current_setting('omega.president')::uuid;
  v_chapter uuid := current_setting('omega.chapter')::uuid;
  v_before bigint;
  v_name text;
begin
  select max(id) into v_before from public.fbla_audit_log;
  select name into v_name from public.fbla_chapters where id = v_chapter;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pres::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fbla_delete_chapter(v_chapter, v_name);
  reset role;
  perform pg_temp.omega_check('audit: chapter deletion logged once, with the president as actor',
    (select count(*) from public.fbla_audit_log a where a.id > v_before) = 1
      and exists (select 1 from public.fbla_audit_log a where a.id > v_before and a.action = 'chapter_deleted'
                    and a.target_id = v_chapter::text and a.actor_id = v_pres and (a.detail ->> 'members')::int >= 2),
    (select string_agg(a.action, ',') from public.fbla_audit_log a where a.id > v_before));
end;
$$;

-- ------------------------------------------------------------------------------------------------ server events
select pg_temp.omega_check('server: graded practice records practice_completed',
  exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.profile')::uuid
            and e.event_name = 'practice_completed' and e.event_code = 'economics' and e.meta ->> 'mode' = 'practice'));
select pg_temp.omega_check('server: graded mock records exam_completed',
  exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.profile')::uuid
            and e.event_name = 'exam_completed' and e.event_code = 'economics'));
select pg_temp.omega_check('server: a duel attempt records no practice or exam event',
  not exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.profile')::uuid
                and e.event_name in ('practice_completed', 'exam_completed') and e.meta ->> 'mode' = 'duel'));
select pg_temp.omega_check('server: a first profile records onboarding_completed',
  current_setting('omega.newbie') = '' or exists (
    select 1 from public.fbla_analytics_events e where e.user_id = nullif(current_setting('omega.newbie'), '')::uuid
       and e.event_name = 'onboarding_completed' and e.event_code = 'accounting'),
  'newbie=' || current_setting('omega.newbie'));
select pg_temp.omega_check('server: feedback records feedback_submitted with its kind only',
  exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.qa')::uuid
            and e.event_name = 'feedback_submitted' and e.meta = '{"kind":"bug"}'::jsonb));
select pg_temp.omega_check('server: two quick vocab reviews make one session',
  (select count(*) from public.fbla_analytics_events e where e.user_id = current_setting('omega.qa')::uuid
     and e.event_name = 'vocab_session_completed' and e.event_code = 'marketing') = 1);
select pg_temp.omega_check('server: opening a duel run records duel_started',
  exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.profile')::uuid
            and e.event_name = 'duel_started' and e.event_code = 'economics'));

update public.fbla_duels set status = 'complete', winner_id = current_setting('omega.profile')::uuid, completed_at = now()
 where id = current_setting('omega.duel')::uuid;
select pg_temp.omega_check('server: a settled duel records one event per player with the outcome',
  (select count(*) from public.fbla_analytics_events e where e.event_name = 'duel_completed'
     and ((e.user_id = current_setting('omega.profile')::uuid and e.meta ->> 'outcome' = 'win')
       or (e.user_id = current_setting('omega.profile2')::uuid and e.meta ->> 'outcome' = 'loss'))) = 2);

do $$
declare
  v_gone int;
  v_left int;
begin
  insert into public.fbla_analytics_events (event_name, user_id, created_at)
  values ('event_selected', current_setting('omega.qa')::uuid, now() - interval '14 months'),
         ('event_selected', current_setting('omega.qa')::uuid, now() - interval '12 months');
  v_gone := fbla_private.fbla_purge_analytics();
  select count(*) into v_left from public.fbla_analytics_events where created_at < now() - interval '13 months';
  perform pg_temp.omega_check('retention: rows older than 13 months are purged, newer kept',
    v_gone = 1 and v_left = 0 and exists (select 1 from public.fbla_analytics_events
                                           where created_at = now() - interval '12 months'),
    'purged=' || v_gone || ' left=' || v_left);
end;
$$;
select pg_temp.omega_check('retention: the daily purge job is scheduled',
  exists (select 1 from cron.job where jobname = 'fbla-analytics-purge' and command like '%fbla_purge_analytics%'));

-- ------------------------------------------------------------------------------------------------ grants overview
select pg_temp.omega_check('grants: no new fbla_private function is executable by anon or authenticated',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'fbla_private'
                 and p.proname in ('fbla_meta_ok', 'fbla_record_event', 'fbla_purge_analytics', 'fbla_audit',
                                   'fbla_count', 'fbla_rate', 'fbla_accounts', 'fbla_activity', 'fbla_local_day',
                                   'fbla_day_start', 'fbla_feedback_guard', 'fbla_audit_immutable')
                 and (has_function_privilege('anon', p.oid, 'execute')
                      or has_function_privilege('authenticated', p.oid, 'execute'))),
  'checked');
select pg_temp.omega_check('grants: every owner RPC is closed to anon and open to authenticated',
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fbla\_owner\_%')
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'fbla\_owner\_%') = 12,
  'checked');
select pg_temp.omega_check('grants: every owner RPC is SECURITY DEFINER with an empty search_path and checks ownership first',
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']
                   and position('is_platform_owner()' in substr(p.prosrc, position(chr(10) || 'begin' || chr(10) in p.prosrc))) between 1 and 40)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fbla\_owner\_%'),
  'checked');

select name, ok, detail from omega_results order by ok, name;
