-- Owner console impersonation tests (Omega, FBLA project uhgzeuvybyohdbfuhfil).
--
-- Body only: scripts/owner-dryrun.mjs wraps it as  BEGIN; <0101..0106 migrations>; <this file>; ROLLBACK;
-- so the migrations, every fixture and every write below are rolled back. Never run it outside that wrapper.
--
-- Identities:
--   anon               no JWT subject
--   QA student         1cb2408f-5da3-4c05-964a-2a1ceed78fc8 (plain student, never an owner)
--   fake owner         another existing auth user, made owner by inserting a private.platform_owners row inside the
--                      rolled-back transaction
--   owner, no profile  a synthetic auth user with no FBLA profile (signed up, never onboarded), also made owner
--   president          the president of a chapter that has another member (for the existing chapter RPCs)
-- Synthetic data, made inside the transaction: 14 accounts with profiles 90 to 120 days ago (no real account is that
-- old), and the analytics rows below (the analytics table itself is new in this transaction).
-- Output: one row per check (name, ok, detail). Every row must have ok = true.

create temp table omega_results (name text primary key, ok boolean not null, detail text);
create temp table omega_starters (user_id uuid primary key, ord int not null);

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

-- Same, but null instead of an error.
create function pg_temp.omega_as_or_null(p_uid uuid, p_sql text)
returns jsonb
language plpgsql
as $$
begin
  return pg_temp.omega_as(p_uid, p_sql);
exception when others then
  return null;
end;
$$;

-- True when no {"value": n} anywhere in the document has n between 1 and 4.
create function pg_temp.omega_no_small(p jsonb)
returns boolean language sql as $$
  select not jsonb_path_exists(p, 'lax $.** ? (@.type() == "object" && exists(@.value) && @.value >= 1 && @.value <= 4)');
$$;

-- The shown value of a Count, or null when it is hidden (or missing).
create function pg_temp.omega_shown(c jsonb)
returns bigint language sql as $$
  select case when c is null or jsonb_typeof(c) <> 'object' or coalesce((c ->> 'suppressed')::boolean, true) then null
              else (c ->> 'value')::bigint end;
$$;

-- False when a group and a smaller group inside it are both shown and differ by 1 to 4 (subtracting would give a
-- group that small away).
create function pg_temp.omega_gap_ok(p_big jsonb, p_small jsonb)
returns boolean language sql as $$
  select pg_temp.omega_shown(p_big) is null or pg_temp.omega_shown(p_small) is null
      or not (pg_temp.omega_shown(p_big) - pg_temp.omega_shown(p_small) between 1 and 4);
$$;

-- In a growth response every shown sign-up count must be the difference of two shown running totals (the bucket's and
-- the one before it, or the baseline), and a hidden one must not sit between two shown totals. Returns the start of
-- the first bucket that breaks this, else null.
create function pg_temp.omega_growth_problem(g jsonb)
returns text language sql as $$
  select min(x.b ->> 'start')
    from (select s.b,
                 case when s.i = 1 then g -> 'baseline' else g -> 'series' -> (s.i::int - 2) -> 'total' end as prev
            from jsonb_array_elements(g -> 'series') with ordinality s(b, i)) x
   where case when pg_temp.omega_shown(x.b -> 'signups') is not null
              then pg_temp.omega_shown(x.b -> 'total') is null or pg_temp.omega_shown(x.prev) is null
                   or pg_temp.omega_shown(x.b -> 'signups')
                      <> pg_temp.omega_shown(x.b -> 'total') - pg_temp.omega_shown(x.prev)
              else pg_temp.omega_shown(x.b -> 'total') is not null and pg_temp.omega_shown(x.prev) is not null end;
$$;

-- Every running account total a growth response shows (the baseline before the first bucket included).
create function pg_temp.omega_totals(g jsonb)
returns setof bigint language sql as $$
  select pg_temp.omega_shown(g -> 'baseline') where pg_temp.omega_shown(g -> 'baseline') is not null
  union all
  select pg_temp.omega_shown(b -> 'total') from jsonb_array_elements(g -> 'series') b
   where pg_temp.omega_shown(b -> 'total') is not null;
$$;

-- Whether this transaction holds pg_advisory_xact_lock(hashtextextended(p_key, 0)).
create function pg_temp.omega_lock_held(p_key text)
returns boolean language sql as $$
  select exists (
    select 1 from pg_locks l
     where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1 and l.granted
       and l.classid::bigint = ((hashtextextended(p_key, 0) >> 32) & 4294967295)
       and l.objid::bigint = (hashtextextended(p_key, 0) & 4294967295));
$$;

-- ------------------------------------------------------------------------------------------------ fixtures
do $$
declare
  v_qa uuid := '1cb2408f-5da3-4c05-964a-2a1ceed78fc8';
  v_today date := fbla_private.fbla_local_day(now());
  v_owner uuid;
  v_np_owner uuid := gen_random_uuid();
  v_chapter uuid;
  v_president uuid;
  v_profile uuid;
  v_profile2 uuid;
  v_duel uuid;
  v_q text;
  v_terms text[];
  v_newbie uuid;
  v_syn uuid;
  v_at timestamptz;
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

  -- An owner who signed up and confirmed the email but never made an FBLA profile.
  insert into auth.users (id, created_at, updated_at, raw_user_meta_data)
  values (v_np_owner, now(), now(), '{"app":"kcb-fbla"}');
  insert into private.platform_owners (user_id, note) values (v_np_owner, 'dry-run owner without a profile (rolled back)');

  -- The QA student needs a profile to join a chapter and file reports (it may already have one).
  if not exists (select 1 from public.fbla_profiles where id = v_qa) then
    insert into public.fbla_profiles (id, username, display_name, main_event)
    values (v_qa, 'omega_dryrun_qa', 'Dry Run QA', 'accounting');
  end if;
  select p.id into v_profile from public.fbla_profiles p where p.id not in (v_qa, v_owner) order by p.created_at limit 1;
  select p.id into v_profile2 from public.fbla_profiles p
   where p.id not in (v_qa, v_owner, v_profile) order by p.created_at limit 1;
  if v_profile2 is null then raise exception 'setup: need two more profiles'; end if;

  -- Onboarding: give an account without a profile its first profile (fires the onboarding trigger).
  select u.id into v_newbie from auth.users u
   where not exists (select 1 from public.fbla_profiles p where p.id = u.id) and u.id not in (v_owner, v_np_owner)
   order by u.created_at limit 1;
  if v_newbie is not null then
    insert into public.fbla_profiles (id, username, display_name, main_event)
    values (v_newbie, 'omega_dryrun_new', 'Dry Run Newcomer', 'accounting');
  end if;

  -- Synthetic sign-ups, each finishing sign-up at once: 5 accounts 120 days ago, 3 (a group to hide) 100 days ago
  -- and 6 90 days ago.
  for i in 1..14 loop
    v_syn := gen_random_uuid();
    v_at := fbla_private.fbla_day_start(v_today - case when i <= 5 then 120 when i <= 8 then 100 else 90 end)
            + interval '12 hours';
    insert into auth.users (id, created_at, updated_at, raw_user_meta_data) values (v_syn, v_at, v_at, '{"app":"kcb-fbla"}');
    insert into public.fbla_profiles (id, username, display_name, main_event, created_at)
    values (v_syn, 'omega_syn_' || i, 'Dry Run Synthetic ' || i, 'accounting', v_at);
  end loop;

  -- Six students start accounting practice today (they chose it 2 days ago too); two of them finish.
  insert into omega_starters (user_id, ord)
  select x.id, row_number() over (order by x.created_at, x.id)
    from (select u.id, u.created_at from auth.users u
           where u.id not in (v_qa, v_owner, v_np_owner, v_profile, v_profile2)
           order by u.created_at, u.id limit 6) x;
  insert into public.fbla_analytics_events (event_name, user_id, event_code, meta, created_at)
  select x.name, s.user_id, 'accounting', x.meta::jsonb, x.stamp
    from omega_starters s
   cross join (values ('practice_started', '{"mode":"practice"}', now()),
                      ('event_selected', '{}', now() - interval '2 days')) as x(name, meta, stamp);
  insert into public.fbla_analytics_events (event_name, user_id, event_code, meta)
  select 'practice_completed', s.user_id, 'accounting', '{"mode":"practice"}'::jsonb from omega_starters s where s.ord <= 2;
  -- Two open marketing (a group to hide). Every starter also has a made-up code that is not an FBLA event (written
  -- straight to the table: fbla_track refuses it).
  insert into public.fbla_analytics_events (event_name, user_id, event_code)
  select 'event_selected', s.user_id, 'marketing' from omega_starters s where s.ord <= 2;
  insert into public.fbla_analytics_events (event_name, user_id, event_code)
  select 'event_selected', s.user_id, 'made-up-event' from omega_starters s;

  -- Graded attempts by an existing profile: practice and mock record events, a duel attempt does not.
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

  -- Vocab, on synthetic students (no real review history can interfere):
  --   omega_syn_12 reviews a term twice in a row (one session);
  --   omega_syn_13 reviewed 20 minutes ago and keeps going (the same session, nothing new);
  --   omega_syn_14 last reviewed 45 minutes ago (a new session).
  v_terms := array(select t.id from public.fbla_vocab_terms t where t.event = 'marketing' order by t.id limit 2);
  select id into v_syn from public.fbla_profiles where username = 'omega_syn_12';
  insert into public.fbla_vocab_progress (user_id, term_id, box, due_at) values (v_syn, v_terms[1], 0, now());
  update public.fbla_vocab_progress set last_reviewed_at = now(), box = 1 where user_id = v_syn and term_id = v_terms[1];
  update public.fbla_vocab_progress set last_reviewed_at = now() + interval '1 second', box = 2
   where user_id = v_syn and term_id = v_terms[1];
  select id into v_syn from public.fbla_profiles where username = 'omega_syn_13';
  insert into public.fbla_vocab_progress (user_id, term_id, box, due_at, last_reviewed_at)
  values (v_syn, v_terms[1], 1, now(), now() - interval '20 minutes'), (v_syn, v_terms[2], 0, now(), null);
  update public.fbla_vocab_progress set last_reviewed_at = now(), box = 1 where user_id = v_syn and term_id = v_terms[2];
  select id into v_syn from public.fbla_profiles where username = 'omega_syn_14';
  insert into public.fbla_vocab_progress (user_id, term_id, box, due_at, last_reviewed_at)
  values (v_syn, v_terms[1], 1, now(), now() - interval '45 minutes'), (v_syn, v_terms[2], 0, now(), null);
  update public.fbla_vocab_progress set last_reviewed_at = now(), box = 1 where user_id = v_syn and term_id = v_terms[2];

  perform set_config('omega.qa', v_qa::text, true);
  perform set_config('omega.owner', v_owner::text, true);
  perform set_config('omega.np_owner', v_np_owner::text, true);
  perform set_config('omega.chapter', v_chapter::text, true);
  perform set_config('omega.join_code', (select coalesce(c.join_code, c.invite_token) from public.fbla_chapters c
                                          where c.id = v_chapter), true);
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
    'public.fbla_owner_question(''acc-001'')',
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
    'public.fbla_owner_question(current_setting(''omega.question''))',
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
    'count(*) from fbla_private.fbla_account_totals(current_date)',
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
select pg_temp.omega_check('qa: filing feedback takes the per-student lock (parallel requests queue for the rate limit)',
  pg_temp.omega_lock_held('fbla_feedback:' || current_setting('omega.qa')));
select pg_temp.omega_try('qa: may report a question', 'authenticated', current_setting('omega.qa')::uuid,
  'insert into public.fbla_feedback (kind, message, page_path, question_id) values (''question_issue'', ''Wrong answer marked correct'', ''/play/review/abc'', current_setting(''omega.question''))', 'ok');

-- The owner reads feedback through the RPCs only (no table policy), so the test looks the id up as the server.
select set_config('omega.qa_bug', (select f.id::text from public.fbla_feedback f
  where f.user_id = current_setting('omega.qa')::uuid and f.kind = 'bug' order by f.created_at limit 1), true);

select pg_temp.omega_try('qa: track an allowed event', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''accounting'', ''{"source":"play"}''::jsonb)', 'ok');
select pg_temp.omega_check('qa: tracking takes the per-student lock (parallel requests queue for the rate limit)',
  pg_temp.omega_lock_held('fbla_track:' || current_setting('omega.qa')));
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
select pg_temp.omega_try('qa: track refuses an event code that is not an FBLA event', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_track(''event_selected'', ''made-up-event'')', '22023');

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
select pg_temp.omega_try('owner without a profile runs ' || f, 'authenticated', current_setting('omega.np_owner')::uuid,
  'select ' || f, 'ok')
  from unnest(array[
    'public.fbla_owner_overview()',
    'public.fbla_owner_growth(30, ''day'')',
    'public.fbla_owner_feedback_list(''open'', null, 50, 0)',
    'public.fbla_owner_audit_search(90, null, null, 50, 0)'
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
  v_gd130 jsonb;
  v_gw130 jsonb;
  v_gm130 jsonb;
  v_en jsonb;
  v_pr jsonb;
  v_co jsonb;
  v_fb jsonb;
  v_us jsonb;
  v_us_id jsonb;
  v_mk jsonb;
  v_ac jsonb;
  v_bad int;
  v_rem bigint;
  v_pool bigint[];
begin
  select count(distinct x.user_id) into v_expect_dau from (
    select e.user_id from public.fbla_analytics_events e where e.created_at >= v_day and e.event_name <> 'duel_completed'
    union all select a.user_id from public.fbla_attempts a where a.created_at >= v_day) x;

  v_ov := pg_temp.omega_as(v_owner, 'public.fbla_owner_overview()');
  v_gd := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(30, ''day'')');
  v_gw := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(30, ''week'')');
  v_gm := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(60, ''month'')');
  v_gd130 := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(130, ''day'')');
  v_gw130 := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(130, ''week'')');
  v_gm130 := pg_temp.omega_as(v_owner, 'public.fbla_owner_growth(130, ''month'')');
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
      and pg_temp.omega_no_small(v_gm) and pg_temp.omega_no_small(v_gd130) and pg_temp.omega_no_small(v_gw130)
      and pg_temp.omega_no_small(v_gm130) and pg_temp.omega_no_small(v_en) and pg_temp.omega_no_small(v_pr)
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
    not exists (select 1 from jsonb_array_elements(v_gd130 -> 'series') with ordinality a(b, i)
                  join jsonb_array_elements(v_gd130 -> 'series') with ordinality c(d, j) on j = i + 1
                 where (a.b #>> '{total,value}') is not null and (c.d #>> '{total,value}') is not null
                   and (c.d #>> '{total,value}')::int < (a.b #>> '{total,value}')::int), 'checked');

  -- Sign-ups against running totals: nothing hidden can be rebuilt by subtraction, within a response or across
  -- Overview and every Growth range and bucket size.
  perform pg_temp.omega_check('owner: every shown sign-up count is the gap between two shown totals, and no hidden one sits between two',
    pg_temp.omega_growth_problem(v_gd130) is null and pg_temp.omega_growth_problem(v_gw130) is null
      and pg_temp.omega_growth_problem(v_gm130) is null and pg_temp.omega_growth_problem(v_gd) is null
      and pg_temp.omega_growth_problem(v_gw) is null and pg_temp.omega_growth_problem(v_gm) is null,
    concat_ws(' ', 'day130=' || pg_temp.omega_growth_problem(v_gd130), 'week130=' || pg_temp.omega_growth_problem(v_gw130),
              'month130=' || pg_temp.omega_growth_problem(v_gm130), 'day30=' || pg_temp.omega_growth_problem(v_gd),
              'week30=' || pg_temp.omega_growth_problem(v_gw), 'month60=' || pg_temp.omega_growth_problem(v_gm)));
  v_pool := array(
    select t from (
      select pg_temp.omega_totals(v_gd130) as t
      union all select pg_temp.omega_totals(v_gw130)
      union all select pg_temp.omega_totals(v_gm130)
      union all select pg_temp.omega_totals(v_gd)
      union all select pg_temp.omega_totals(v_gw)
      union all select pg_temp.omega_totals(v_gm)
      union all select pg_temp.omega_shown(v_ov -> 'accounts')
      union all select pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,day}')
      union all select pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,week}')
      union all select pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,month}')
    ) x where t is not null);
  perform pg_temp.omega_check('owner: no two shown account totals differ by 1 to 4 (Overview and every Growth range and bucket)',
    not exists (select 1 from unnest(v_pool) a, unnest(v_pool) b where a - b between 1 and 4),
    'totals compared: ' || cardinality(v_pool));
  perform pg_temp.omega_check('owner: a day with 3 sign-ups is hidden, and so is its week',
    exists (select 1 from jsonb_array_elements(v_gd130 -> 'series') b
             where (b ->> 'start')::date = v_today - 100 and (b #>> '{signups,suppressed}') = 'true')
      and exists (select 1 from jsonb_array_elements(v_gw130 -> 'series') b
                   where (b ->> 'start')::date <= v_today - 100 and (b ->> 'end')::date >= v_today - 100
                     and (b #>> '{signups,suppressed}') = 'true'),
    (select string_agg((b ->> 'start') || ':' || coalesce(b #>> '{signups,value}', 'hidden') || '/'
                       || coalesce(b #>> '{total,value}', 'hidden'), ' ')
       from jsonb_array_elements(v_gd130 -> 'series') b
      where (b ->> 'start')::date in (v_today - 121, v_today - 120, v_today - 101, v_today - 100, v_today - 91, v_today - 90)));
  perform pg_temp.omega_check('owner: Overview new accounts match the Growth totals',
    (pg_temp.omega_shown(v_ov #> '{new_accounts,day}') is null
      or pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,day}')
         = (select pg_temp.omega_shown(b -> 'total') from jsonb_array_elements(v_gd130 -> 'series') b
             where (b ->> 'end')::date = v_today - 1))
    and (pg_temp.omega_shown(v_ov #> '{new_accounts,week}') is null
      or pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,week}')
         = (select pg_temp.omega_shown(b -> 'total') from jsonb_array_elements(v_gd130 -> 'series') b
             where (b ->> 'end')::date = v_today - 7))
    and (pg_temp.omega_shown(v_ov #> '{new_accounts,month}') is null
      or pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,month}')
         = (select pg_temp.omega_shown(b -> 'total') from jsonb_array_elements(v_gd130 -> 'series') b
             where (b ->> 'end')::date = v_today - 30)),
    'accounts=' || coalesce(v_ov ->> 'accounts', 'null') || ' new=' || coalesce(v_ov ->> 'new_accounts', 'null'));

  -- Onboarding: the accounts that did not finish sign-up can't be counted by subtraction.
  select count(*) filter (where not exists (select 1 from public.fbla_profiles p where p.id = a.user_id))
    into v_rem from fbla_private.fbla_accounts() a;
  perform pg_temp.omega_check('owner: onboarding counts never give away the accounts that did not finish sign-up',
    pg_temp.omega_gap_ok(v_ov #> '{onboarding,all_time,created}', v_ov #> '{onboarding,all_time,onboarded}')
      and pg_temp.omega_gap_ok(v_ov #> '{onboarding,month,created}', v_ov #> '{onboarding,month,onboarded}')
      and pg_temp.omega_gap_ok(v_ov -> 'accounts', v_ov -> 'profiles')
      and ((v_ov #> '{onboarding,all_time}' -> 'rate') = 'null'::jsonb
           or pg_temp.omega_shown(v_ov #> '{onboarding,all_time,onboarded}') is not null)
      and ((v_ov #> '{onboarding,month}' -> 'rate') = 'null'::jsonb
           or pg_temp.omega_shown(v_ov #> '{onboarding,month,onboarded}') is not null)
      and coalesce(not (pg_temp.omega_shown(v_ov #> '{onboarding,all_time,onboarded}')
                        - pg_temp.omega_shown(v_ov #> '{onboarding,month,onboarded}') between 1 and 4), true)
      and coalesce(not ((pg_temp.omega_shown(v_ov -> 'accounts') - pg_temp.omega_shown(v_ov #> '{new_accounts,month}'))
                        - (pg_temp.omega_shown(v_ov #> '{onboarding,all_time,onboarded}')
                           - pg_temp.omega_shown(v_ov #> '{onboarding,month,onboarded}')) between 1 and 4), true),
    'onboarding=' || coalesce(v_ov ->> 'onboarding', 'null'));
  perform pg_temp.omega_check('owner: 1 to 4 accounts without a profile hide the all-time sign-up count and rate',
    v_rem between 1 and 4 and (v_ov #>> '{onboarding,all_time,onboarded,suppressed}') = 'true'
      and (v_ov #> '{onboarding,all_time}' -> 'rate') = 'null'::jsonb,
    'accounts without a profile: ' || v_rem || ', all_time=' || coalesce(v_ov #>> '{onboarding,all_time}', 'null'));

  -- Active-user windows: today inside this week inside this month, returning and answering inside them.
  perform pg_temp.omega_check('owner: active-user windows never give away a group of 1 to 4 by subtraction',
    pg_temp.omega_gap_ok(v_ov #> '{active,wau}', v_ov #> '{active,dau}')
      and pg_temp.omega_gap_ok(v_ov #> '{active,mau}', v_ov #> '{active,wau}')
      and pg_temp.omega_gap_ok(v_ov #> '{active,mau}', v_ov #> '{active,dau}')
      and pg_temp.omega_gap_ok(v_ov #> '{active,mau}', v_ov -> 'returning')
      and pg_temp.omega_gap_ok(v_ov #> '{active,wau}', v_ov #> '{answered_week,users}')
      and pg_temp.omega_gap_ok(v_ov #> '{active,mau}', v_ov #> '{answered_week,users}')
      and ((v_ov -> 'returning_rate') = 'null'::jsonb
           or (pg_temp.omega_shown(v_ov -> 'returning') is not null and pg_temp.omega_shown(v_ov #> '{active,mau}') is not null)),
    'active=' || coalesce(v_ov ->> 'active', 'null') || ' returning=' || coalesce(v_ov ->> 'returning', 'null')
      || ' answered=' || coalesce(v_ov ->> 'answered_week', 'null'));

  -- Engagement: 7 started (6 in accounting), 3 finished (2 accounting starters and the economics profile).
  perform pg_temp.omega_check('owner: 1 to 4 students finishing hides the finished count and the finish rate',
    pg_temp.omega_shown(v_en #> '{practice,started,users}') >= 5
      and (v_en #>> '{practice,completed,users,suppressed}') = 'true'
      and (v_en #> '{practice,completed}' -> 'events') = 'null'::jsonb
      and (v_en #> '{practice}' -> 'completion_rate') = 'null'::jsonb,
    coalesce(v_en ->> 'practice', 'null'));
  select r into v_ac from jsonb_array_elements(v_pr -> 'events') r where r ->> 'event' = 'accounting';
  perform pg_temp.omega_check('owner: 1 to 4 students finishing an event hides its not-finished share',
    pg_temp.omega_shown(v_ac -> 'started') >= 5 and (v_ac -> 'abandonment') = 'null'::jsonb, coalesce(v_ac::text, 'missing'));
  perform pg_temp.omega_check('owner: engagement never pairs a shown number with a hidden group',
    ((v_en #> '{practice}' -> 'completion_rate') = 'null'::jsonb
       or ((v_en #> '{practice,completed}' -> 'events') <> 'null'::jsonb and (v_en #> '{practice,started}' -> 'events') <> 'null'::jsonb))
      and (pg_temp.omega_shown(v_en #> '{practice,completed,users}') is not null
           or (v_en #> '{practice,completed}' -> 'events') = 'null'::jsonb)
      and (pg_temp.omega_shown(v_en #> '{practice,started,users}') is not null
           or (v_en #> '{practice,started}' -> 'events') = 'null'::jsonb)
      and not exists (select 1 from jsonb_array_elements(v_en -> 'modes') m
                       where m ->> 'mode' <> 'duel' and not pg_temp.omega_gap_ok(v_en #> '{practice,completed,users}', m -> 'users'))
      and not exists (select 1 from jsonb_array_elements(v_en -> 'features') f
                       where pg_temp.omega_shown(f -> 'users') is null and coalesce(f -> 'events', 'null'::jsonb) <> 'null'::jsonb)
      and not exists (select 1 from jsonb_array_elements(v_en -> 'modes') m
                       where pg_temp.omega_shown(m -> 'users') is null and coalesce(m -> 'attempts', 'null'::jsonb) <> 'null'::jsonb)
      and not exists (select 1 from jsonb_array_elements(v_en -> 'popular_events') p
                       where pg_temp.omega_shown(p -> 'users') is null and coalesce(p -> 'events', 'null'::jsonb) <> 'null'::jsonb)
      and coalesce((v_en #> '{duels}' -> 'created') = 'null'::jsonb or pg_temp.omega_shown(v_en #> '{duels,players}') is not null, true),
    coalesce(v_en ->> 'practice', 'null'));
  perform pg_temp.omega_check('owner: features leave out events FBLA never sends',
    not exists (select 1 from jsonb_array_elements(v_en -> 'features') f
                 where f ->> 'name' in ('install_prompt_shown', 'app_installed', 'push_enabled')),
    (select string_agg(f ->> 'name', ',') from jsonb_array_elements(v_en -> 'features') f));

  select p into v_mk from jsonb_array_elements(v_en -> 'popular_events') p where p ->> 'code' = 'marketing';
  select p into v_ac from jsonb_array_elements(v_en -> 'popular_events') p where p ->> 'code' = 'accounting';
  perform pg_temp.omega_check('owner: a 2-3 user event is listed as hidden, with no count of times',
    v_mk is not null and (v_mk #>> '{users,value}') is null and (v_mk #>> '{users,suppressed}') = 'true'
      and coalesce(v_mk -> 'events', 'null'::jsonb) = 'null'::jsonb, coalesce(v_mk::text, 'missing'));
  perform pg_temp.omega_check('owner: a 5+ user event is shown', pg_temp.omega_shown(v_ac -> 'users') >= 5,
    coalesce(v_ac::text, 'missing'));
  perform pg_temp.omega_check('owner: popular events list only real FBLA events',
    not exists (select 1 from jsonb_array_elements(v_en -> 'popular_events') p
                 where not exists (select 1 from public.fbla_questions q where q.event = p ->> 'code')),
    (select string_agg(p ->> 'code', ',') from jsonb_array_elements(v_en -> 'popular_events') p));

  select count(*) into v_bad from jsonb_array_elements(v_pr -> 'events') r
   where ((r #>> '{users,suppressed}') = 'true' and (r -> 'attempts' <> 'null'::jsonb or r -> 'accuracy' <> 'null'::jsonb))
      or ((r #>> '{users,value}') = '0' and r -> 'accuracy' <> 'null'::jsonb)
      or ((r #>> '{started,suppressed}') = 'true' and r -> 'abandonment' <> 'null'::jsonb);
  perform pg_temp.omega_check('owner: preparation hides counts and accuracy for small groups', v_bad = 0, 'bad rows=' || v_bad);
  perform pg_temp.omega_check('owner: preparation lists every FBLA event once',
    jsonb_array_length(v_pr -> 'events') = (select count(distinct q.event) from public.fbla_questions q),
    'rows=' || jsonb_array_length(v_pr -> 'events'));

  -- Four more accounting starters finish: 7 students finished, so the counts and the rate show.
  insert into public.fbla_analytics_events (event_name, user_id, event_code, meta)
  select 'practice_completed', s.user_id, 'accounting', '{"mode":"practice"}'::jsonb from omega_starters s where s.ord between 3 and 6;
  v_en := pg_temp.omega_as(v_owner, 'public.fbla_owner_engagement(30)');
  v_pr := pg_temp.omega_as(v_owner, 'public.fbla_owner_preparation(30)');
  perform pg_temp.omega_check('owner: once 5+ students finished, the finish rate is finished over started',
    pg_temp.omega_shown(v_en #> '{practice,completed,users}') >= 5
      and (v_en #>> '{practice,completion_rate}')::numeric
          = round(least(1, (v_en #>> '{practice,completed,events}')::numeric / (v_en #>> '{practice,started,events}')::numeric), 3),
    coalesce(v_en ->> 'practice', 'null'));
  select r into v_ac from jsonb_array_elements(v_pr -> 'events') r where r ->> 'event' = 'accounting';
  perform pg_temp.omega_check('owner: once 5+ students finished an event, its not-finished share shows',
    (v_ac ->> 'abandonment')::numeric between 0 and 1, coalesce(v_ac::text, 'missing'));

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

-- A reported question opens with everything needed to judge the report.
select pg_temp.omega_try('owner: an unknown question is not found', 'authenticated', current_setting('omega.owner')::uuid,
  'select public.fbla_owner_question(''no-such-question'')', 'P0002');
select pg_temp.omega_check('owner: a reported question opens with its choices, key and explanation',
  coalesce((select q ->> 'id' = current_setting('omega.question') and jsonb_typeof(q -> 'choices') = 'array'
                   and (q ->> 'answer')::int = (select x.answer from public.fbla_questions x where x.id = current_setting('omega.question'))
                   and q ? 'explanation' and q ->> 'question' is not null
              from (select pg_temp.omega_as_or_null(current_setting('omega.owner')::uuid,
                      'public.fbla_owner_question(current_setting(''omega.question''))') as q) y), false));

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

-- The owner without a profile bans and unbans too (the ban row then names no banner).
select pg_temp.omega_try('owner without a profile: ban from chapter', 'authenticated', current_setting('omega.np_owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, true, ''Dry run: owner without a profile'')', 'ok');
select pg_temp.omega_check('owner without a profile: the ban row names no banner',
  exists (select 1 from public.fbla_chapter_bans b where b.chapter_id = current_setting('omega.chapter')::uuid
            and b.user_id = current_setting('omega.qa')::uuid and b.banned_by is null));
select pg_temp.omega_try('owner without a profile: unban', 'authenticated', current_setting('omega.np_owner')::uuid,
  'select public.fbla_owner_set_chapter_ban(current_setting(''omega.qa'')::uuid, current_setting(''omega.chapter'')::uuid, false, null)', 'ok');

-- Existing chapter RPCs, as the chapter's president: they are audited too.
select pg_temp.omega_try('president: fbla_add_member still works', 'authenticated', current_setting('omega.president')::uuid,
  'select public.fbla_add_member(current_setting(''omega.chapter'')::uuid, current_setting(''omega.qa_username''))', 'ok');
select pg_temp.omega_try('president: fbla_set_role still works', 'authenticated', current_setting('omega.president')::uuid,
  'select public.fbla_set_role(current_setting(''omega.chapter'')::uuid, current_setting(''omega.qa'')::uuid, ''executive'')', 'ok');
select pg_temp.omega_try('president: fbla_remove_member still works', 'authenticated', current_setting('omega.president')::uuid,
  'select public.fbla_remove_member(current_setting(''omega.chapter'')::uuid, current_setting(''omega.qa'')::uuid)', 'ok');
select pg_temp.omega_try('qa: joining with the chapter code still works', 'authenticated', current_setting('omega.qa')::uuid,
  'select public.fbla_join_chapter(current_setting(''omega.join_code''))', 'ok');

-- ------------------------------------------------------------------------------------------------ audit log
do $$
declare
  v_owner uuid := current_setting('omega.owner')::uuid;
  v_np uuid := current_setting('omega.np_owner')::uuid;
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
  perform pg_temp.omega_check('audit: a ban by the owner without a profile is logged with them as actor',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_banned' and a.target_id = v_qa
              and a.actor_id = v_np and a.detail ->> 'via' = 'owner_console')
      and exists (select 1 from public.fbla_audit_log a where a.action = 'member_unbanned' and a.target_id = v_qa
                    and a.actor_id = v_np));
  perform pg_temp.omega_check('audit: a ban does not also log a removal',
    not exists (select 1 from public.fbla_audit_log a where a.action = 'member_removed' and a.actor_id in (v_owner, v_np)));
  perform pg_temp.omega_check('audit: unban logged',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_unbanned' and a.target_id = v_qa and a.actor_id = v_owner));
  perform pg_temp.omega_check('audit: refused president ban wrote nothing',
    not exists (select 1 from public.fbla_audit_log a where a.action = 'member_banned' and a.target_id = v_pres::text));
  perform pg_temp.omega_check('audit: an admin adding a player by username is logged',
    exists (select 1 from public.fbla_audit_log a where a.action = 'member_added' and a.target_id = v_qa
              and a.actor_id = v_pres and a.detail ->> 'chapter_id' = current_setting('omega.chapter')));
  perform pg_temp.omega_check('audit: joining with a code yourself is not logged as an addition',
    not exists (select 1 from public.fbla_audit_log a where a.action = 'member_added' and a.actor_id = v_qa::uuid));
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
select pg_temp.omega_check('server: vocab sessions follow 30 quiet minutes ' || x.who,
  (select count(*) from public.fbla_analytics_events e
    where e.user_id = (select p.id from public.fbla_profiles p where p.username = x.who)
      and e.event_name = 'vocab_session_completed') = x.want,
  x.who || ' wants ' || x.want)
  from (values ('omega_syn_12', 1), ('omega_syn_13', 0), ('omega_syn_14', 1)) as x(who, want);
select pg_temp.omega_check('server: opening a duel run records duel_started',
  exists (select 1 from public.fbla_analytics_events e where e.user_id = current_setting('omega.profile')::uuid
            and e.event_name = 'duel_started' and e.event_code = 'economics'));

do $$
declare
  v_p2 uuid := current_setting('omega.profile2')::uuid;
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from fbla_private.fbla_activity(now() - interval '1 day', 'infinity') x where x.user_id = v_p2;
  update public.fbla_duels set status = 'complete', winner_id = current_setting('omega.profile')::uuid, completed_at = now()
   where id = current_setting('omega.duel')::uuid;
  select count(*) into v_after from fbla_private.fbla_activity(now() - interval '1 day', 'infinity') x where x.user_id = v_p2;
  perform pg_temp.omega_check('server: a settled duel records one event per player with the outcome',
    (select count(*) from public.fbla_analytics_events e where e.event_name = 'duel_completed'
       and ((e.user_id = current_setting('omega.profile')::uuid and e.meta ->> 'outcome' = 'win')
         or (e.user_id = v_p2 and e.meta ->> 'outcome' = 'loss'))) = 2);
  perform pg_temp.omega_check('activity: the other player''s duel finishing is not activity for them',
    v_after = v_before, 'before=' || v_before || ' after=' || v_after);
end;
$$;

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

-- Moving owner access straight to another account (direct SQL) logs both sides.
do $$
declare
  v_np uuid := current_setting('omega.np_owner')::uuid;
  v_to uuid;
begin
  select p.id into v_to from public.fbla_profiles p where p.username = 'omega_syn_11';
  update private.platform_owners set user_id = v_to where user_id = v_np;
  perform pg_temp.omega_check('audit: moving owner access to another account logs the revoke and the grant',
    exists (select 1 from public.fbla_audit_log a where a.action = 'owner_revoked' and a.target_id = v_np::text)
      and exists (select 1 from public.fbla_audit_log a where a.action = 'owner_granted' and a.target_id = v_to::text));
end;
$$;

-- ------------------------------------------------------------------------------------------------ grants overview
select pg_temp.omega_check('grants: no new fbla_private function is executable by anon or authenticated',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'fbla_private'
                 and p.proname = any (x.names)
                 and (has_function_privilege('anon', p.oid, 'execute')
                      or has_function_privilege('authenticated', p.oid, 'execute')))
    and (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'fbla_private' and p.proname = any (x.names)) = cardinality(x.names),
  'functions checked: ' || cardinality(x.names))
  from (select array['fbla_meta_ok', 'fbla_record_event', 'fbla_purge_analytics', 'fbla_trg_analytics_onboarding',
                     'fbla_trg_analytics_attempt', 'fbla_trg_analytics_duel_started', 'fbla_trg_analytics_duel_completed',
                     'fbla_trg_analytics_vocab', 'fbla_feedback_guard', 'fbla_trg_analytics_feedback',
                     'fbla_audit_immutable', 'fbla_audit', 'fbla_trg_audit_member_role', 'fbla_trg_audit_member_removed',
                     'fbla_trg_audit_member_added', 'fbla_trg_audit_ban', 'fbla_trg_audit_unban', 'fbla_trg_audit_trainer',
                     'fbla_trg_audit_chapter_delete', 'fbla_trg_audit_platform_owner', 'fbla_count', 'fbla_count_over',
                     'fbla_count_if', 'fbla_count_between', 'fbla_shown', 'fbla_rate', 'fbla_local_day', 'fbla_day_start',
                     'fbla_accounts', 'fbla_activity', 'fbla_account_totals'] as names) x;
select pg_temp.omega_check('grants: every owner RPC is closed to anon and open to authenticated',
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fbla\_owner\_%')
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'fbla\_owner\_%') = 13,
  'checked');
select pg_temp.omega_check('grants: every owner RPC is SECURITY DEFINER with an empty search_path and checks ownership first',
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']
                   and position('is_platform_owner()' in substr(p.prosrc, position(chr(10) || 'begin' || chr(10) in p.prosrc))) between 1 and 40)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fbla\_owner\_%'),
  'checked');

select name, ok, detail from omega_results order by ok, name;
