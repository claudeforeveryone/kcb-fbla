-- 0014 Answer keys and Elo integrity.
--
-- 1. Answer keys are no longer readable by clients: fbla_questions.answer / .explain lose their column grants and
--    public/content/q/*.json ships without them (scripts/build-content.mjs). A member sees a key only:
--      * after grading: fbla_submit_attempt / fbla_submit_duel results,
--      * for instant feedback: fbla_check_answer, whose first answer for a question is binding (the attempt that
--        follows is graded with it, whatever the client sends),
--      * for questions they already answered (fbla_question_keys), for an attempt they may view, or as chapter
--        staff browsing the bank for a test (fbla_question_bank).
--    Every way of seeing a key is logged in fbla_question_reveals, and a question whose key the member has seen
--    before answering it never moves their Elo.
-- 2. Elo moves only on the first graded answer to each question (repeats are worth 0, duplicates inside one attempt
--    are ignored). The running rating is kept unrounded (fbla_profiles.elo_exact) so small gains are not lost to
--    rounding, and peak_elo is the highest rating reached during an attempt, not just at its end.
-- 3. Assignment attempts are checked on the server: kind is set from assignment_id, a test assignment must answer
--    every question of that test, an official one must answer at least 25 distinct questions of that event.
--
-- Client mirror of the Elo rule: src/lib/elo.ts.

-- ---------------------------------------------------------------- keys: column grants
revoke select on public.fbla_questions from authenticated;
revoke select (answer, explain) on public.fbla_questions from authenticated;
grant select (id, event, sub, diff, q, choices) on public.fbla_questions to authenticated;

-- ---------------------------------------------------------------- unrounded Elo
alter table public.fbla_profiles add column if not exists elo_exact double precision;
update public.fbla_profiles set elo_exact = elo where elo_exact is null;
grant select (elo_exact) on public.fbla_profiles to authenticated;

-- ---------------------------------------------------------------- reveals (server only)
-- One row per (member, question) whose key the member has been shown outside a graded submission.
--   pending: shown by fbla_check_answer during a run; the next submission of that question is graded with `chosen`.
--   rated:   that pending check was the member's first sight of the question, so it may still move Elo.
create table if not exists public.fbla_question_reveals (
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  question_id text not null,
  chosen smallint,
  correct boolean not null default false,
  rated boolean not null default false,
  pending boolean not null default false,
  revealed_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.fbla_question_reveals enable row level security;
revoke all on public.fbla_question_reveals from anon, authenticated;

-- ---------------------------------------------------------------- visibility helper (RLS, 0016 uses it too)
-- Can the caller see this member's activity in this event: self, president/executive of the member's chapter, or
-- a trainer of that chapter for exactly that (non-null) event.
create or replace function public.fbla_can_view_member_event(p_user uuid, p_event text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) or exists (
    select 1 from public.fbla_chapter_members m
    where m.user_id = p_user
      and (public.fbla_is_chapter_admin(m.chapter_id)
           or (p_event is not null and exists (
                 select 1 from public.fbla_trainers t
                 where t.chapter_id = m.chapter_id and t.user_id = (select auth.uid()) and t.event = p_event)))
  )
$$;
revoke all on function public.fbla_can_view_member_event(uuid, text) from public, anon;
grant execute on function public.fbla_can_view_member_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------- key lookup (server only)
-- Official id or custom:<testId>:<n>. Returns no row for an unknown id.
create or replace function fbla_private.fbla_question_key(p_qid text)
returns table (answer smallint, explain text, event text, sub text, diff smallint, src text,
               test_id uuid, chapter_id uuid, published boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[];
  v_test public.fbla_custom_tests;
  v_cq jsonb;
begin
  if p_qid like 'custom:%' then
    v_parts := string_to_array(p_qid, ':');
    if cardinality(v_parts) <> 3 or v_parts[2] !~ '^[0-9a-f-]{36}$' or v_parts[3] !~ '^[0-9]{1,4}$' then return; end if;
    select * into v_test from public.fbla_custom_tests t where t.id = v_parts[2]::uuid;
    if not found then return; end if;
    v_cq := v_test.questions -> (v_parts[3]::int);
    if v_cq is null then return; end if;
    return query select (v_cq->>'answer')::smallint, v_cq->>'explain', v_test.event, nullif(v_cq->>'sub', ''),
                        null::smallint, nullif(v_cq->>'src', ''), v_test.id, v_test.chapter_id, v_test.published;
  else
    return query select q.answer, q.explain, q.event, q.sub, q.diff::smallint, null::text, null::uuid, null::uuid,
                        null::boolean
                 from public.fbla_questions q where q.id = p_qid and q.answer is not null;
  end if;
end $$;
revoke all on function fbla_private.fbla_question_key(text) from public, anon, authenticated;

-- Marks keys as seen by a member, outside a run: they can no longer move that member's Elo.
create or replace function fbla_private.fbla_mark_revealed(p_user uuid, p_ids text[])
returns void language sql security definer set search_path = '' as $$
  insert into public.fbla_question_reveals (user_id, question_id, rated, pending)
  select p_user, x, false, false from unnest(p_ids) x
  where x is not null and x not like 'custom:%'
  on conflict (user_id, question_id) do update set rated = false
$$;
revoke all on function fbla_private.fbla_mark_revealed(uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- instant feedback
-- Grades one answer for practice-style runs and returns the key. The first check of a question is binding for 24h:
-- checking again returns the stored result, and the next fbla_submit_attempt containing the question uses it.
create or replace function public.fbla_check_answer(p_question_id text, p_chosen integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  k record;
  r public.fbla_question_reveals;
  v_ok boolean;
  v_rated boolean;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = v_uid) then
    raise exception 'create your profile first' using errcode = '42501';
  end if;
  if p_chosen is not null and p_chosen not between 0 and 3 then
    raise exception 'pick one of the four choices' using errcode = '22023';
  end if;
  select * into k from fbla_private.fbla_question_key(p_question_id);
  if not found then raise exception 'unknown question %', p_question_id using errcode = '22023'; end if;
  if k.test_id is not null and not (public.fbla_in_chapter(k.chapter_id)
       and (k.published or public.fbla_can_manage(k.chapter_id, k.event))) then
    raise exception 'unknown question %', p_question_id using errcode = '22023';
  end if;

  -- one check per member and question at a time
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || '|' || p_question_id, 0));
  select * into r from public.fbla_question_reveals where user_id = v_uid and question_id = p_question_id;
  if found and r.pending and r.revealed_at > now() - interval '24 hours' then
    return jsonb_build_object('question_id', p_question_id, 'chosen', r.chosen, 'correct', r.correct,
      'correct_choice', k.answer, 'explain', k.explain);
  end if;

  v_ok := p_chosen is not null and p_chosen = k.answer;
  v_rated := k.test_id is null and r.user_id is null
    and not exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = p_question_id);
  insert into public.fbla_question_reveals (user_id, question_id, chosen, correct, rated, pending, revealed_at)
  values (v_uid, p_question_id, p_chosen, v_ok, v_rated, true, now())
  on conflict (user_id, question_id) do update
    set chosen = excluded.chosen, correct = excluded.correct, rated = excluded.rated, pending = true,
        revealed_at = excluded.revealed_at;
  -- a chapter question copied from the official bank reveals that key too
  if k.src is not null then perform fbla_private.fbla_mark_revealed(v_uid, array[k.src]); end if;

  return jsonb_build_object('question_id', p_question_id, 'chosen', p_chosen, 'correct', v_ok,
    'correct_choice', k.answer, 'explain', k.explain);
end $$;

-- ---------------------------------------------------------------- keys for review screens
-- Keys for questions the caller has already answered or been shown, plus (with p_attempt) the questions of an
-- attempt the caller may view (their own, or a member's as chapter staff). Returns {question_id: {answer, explain}}.
create or replace function public.fbla_question_keys(p_ids text[], p_attempt uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_att public.fbla_attempts;
  v_attempt_ids text[] := '{}';
  v_out jsonb := '{}'::jsonb;
  v_new text[] := '{}';
  v_id text;
  k record;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return v_out; end if;
  if cardinality(p_ids) > 500 then raise exception 'too many questions' using errcode = '22023'; end if;

  if p_attempt is not null then
    select * into v_att from public.fbla_attempts where id = p_attempt;
    if found then
      select coalesce(array_agg(distinct a.question_id), '{}') into v_attempt_ids
      from public.fbla_answers a
      where a.attempt_id = p_attempt
        and (a.user_id = v_uid or public.fbla_can_view_member_event(a.user_id, a.event));
    end if;
  end if;

  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) x where x is not null) loop
    if not (v_id = any (v_attempt_ids)
            or exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = v_id)
            or exists (select 1 from public.fbla_question_reveals where user_id = v_uid and question_id = v_id)) then
      continue;
    end if;
    select * into k from fbla_private.fbla_question_key(v_id);
    if not found then continue; end if;
    v_out := v_out || jsonb_build_object(v_id, jsonb_build_object('answer', k.answer, 'explain', k.explain));
    if v_id not like 'custom:%'
       and not exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = v_id) then
      v_new := v_new || v_id;
    end if;
  end loop;
  -- a key seen on someone else's attempt can no longer earn the viewer Elo
  if cardinality(v_new) > 0 then perform fbla_private.fbla_mark_revealed(v_uid, v_new); end if;
  return v_out;
end $$;

-- Staff only (president / executive of a chapter, or a trainer for that event): the event's keys, for importing
-- official questions into a chapter test. Seeing them removes those questions from the caller's own Elo.
create or replace function public.fbla_question_bank(p_event text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
  v_ids text[];
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.fbla_chapter_members m
    where m.user_id = v_uid and (m.role in ('president', 'executive') or exists (
      select 1 from public.fbla_trainers t where t.chapter_id = m.chapter_id and t.user_id = v_uid and t.event = p_event))
  ) then
    raise exception 'only chapter staff can open the answer bank' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(q.id, jsonb_build_object('answer', q.answer, 'explain', q.explain)), '{}'::jsonb),
         coalesce(array_agg(q.id), '{}')
    into v_out, v_ids
  from public.fbla_questions q where q.event = p_event and q.answer is not null;
  perform fbla_private.fbla_mark_revealed(v_uid, v_ids);
  return v_out;
end $$;

-- ---------------------------------------------------------------- grading
create or replace function public.fbla_submit_attempt(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.fbla_profiles;
  v_kind text := p->>'kind';
  v_event text := nullif(p->>'event', '');
  v_label text := left(nullif(btrim(p->>'label'), ''), 160);
  v_test_id uuid := nullif(p->>'custom_test_id', '')::uuid;
  v_assign_id uuid := nullif(p->>'assignment_id', '')::uuid;
  v_duel_id uuid := nullif(p->>'duel_id', '')::uuid;
  v_assign public.fbla_assignments;
  v_test public.fbla_custom_tests;
  v_q public.fbla_questions;
  v_cq jsonb;
  v_parts text[];
  v_attempt uuid;
  v_applies_elo boolean;
  v_ef double precision;           -- unrounded running rating
  v_new_f double precision;
  v_elo int;
  v_elo_before int;
  v_peak int;
  v_ans_streak int;
  v_best_ans int;
  v_total int := 0;
  v_correct int := 0;
  v_ms_sum bigint := 0;
  v_duration bigint;
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  a record;
  r public.fbla_question_reveals;
  v_qid text;
  v_chosen int;
  v_ms int;
  v_ok boolean;
  v_key int;
  v_sub text;
  v_diff smallint;
  v_ev text;
  v_explain text;
  v_src text;
  v_first boolean;
  v_delta int;
  v_k int;
  v_qr double precision;
  v_exp double precision;
  v_n int;
  v_need int;
  v_today date := public.fbla_today();
  v_streak int;
  v_codes text[];
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_prof from public.fbla_profiles where id = v_uid for update;
  if not found then raise exception 'create your profile first' using errcode = '42501'; end if;
  if v_kind is null or v_kind not in
     ('practice', 'daily', 'endless', 'weak', 'mock', 'area', 'custom', 'assignment', 'duel', 'redo') then
    raise exception 'unknown attempt kind %', v_kind using errcode = '22023';
  end if;
  if jsonb_typeof(p->'answers') is distinct from 'array' or jsonb_array_length(p->'answers') = 0 then
    raise exception 'no answers to submit' using errcode = '22023';
  end if;
  if jsonb_array_length(p->'answers') > 300 then
    raise exception 'too many answers in one attempt' using errcode = '22023';
  end if;
  if v_event is not null and not public.fbla_is_event(v_event) then
    raise exception 'unknown event %', v_event using errcode = '22023';
  end if;
  if v_duel_id is not null and not exists (
    select 1 from public.fbla_duels where id = v_duel_id and v_uid in (challenger_id, opponent_id)) then
    raise exception 'duel not found' using errcode = '42501';
  end if;
  -- duel attempts are written by fbla_submit_duel only
  if v_kind = 'duel' and v_duel_id is null then
    raise exception 'duels are submitted with fbla_submit_duel' using errcode = '22023';
  end if;

  -- assignments: the kind comes from the assignment, and the answers must be the assigned work
  if v_assign_id is not null then
    select * into v_assign from public.fbla_assignments where id = v_assign_id;
    if not found or not public.fbla_in_chapter(v_assign.chapter_id) then
      raise exception 'assignment not found' using errcode = '42501';
    end if;
    v_kind := 'assignment';
    if v_assign.kind = 'deck' then
      raise exception 'deck assignments are completed from the classroom' using errcode = '22023';
    elsif v_assign.kind = 'test' then
      v_test_id := v_assign.ref::uuid;
      select * into v_test from public.fbla_custom_tests where id = v_test_id;
      if not found then raise exception 'the test for this assignment was deleted' using errcode = '22023'; end if;
      v_need := jsonb_array_length(v_test.questions);
      select count(distinct x.value->>'question_id'),
             count(*) filter (where x.value->>'question_id' like 'custom:' || v_test.id::text || ':%')
        into v_n, v_k
      from jsonb_array_elements(p->'answers') x;
      if v_k <> jsonb_array_length(p->'answers') then
        raise exception 'this assignment only takes the questions of its test' using errcode = '22023';
      end if;
      if v_n < v_need then
        raise exception 'answer every question of the test to complete this assignment' using errcode = '22023';
      end if;
    else
      v_event := v_assign.ref;
      select least(25, count(*)) into v_need from public.fbla_questions where event = v_assign.ref;
      select count(distinct x.value->>'question_id'),
             count(*) filter (where q.event = v_assign.ref)
        into v_n, v_k
      from jsonb_array_elements(p->'answers') x
      left join public.fbla_questions q on q.id = x.value->>'question_id';
      if v_k <> jsonb_array_length(p->'answers') then
        raise exception 'this assignment only takes % questions', v_assign.ref using errcode = '22023';
      end if;
      if v_n < v_need then
        raise exception 'answer all % questions to complete this assignment', v_need using errcode = '22023';
      end if;
    end if;
  elsif v_kind = 'assignment' then
    raise exception 'assignment not found' using errcode = '42501';
  end if;

  if v_test_id is not null and v_test.id is null then
    select * into v_test from public.fbla_custom_tests where id = v_test_id;
    if not found or not public.fbla_in_chapter(v_test.chapter_id)
       or not (v_test.published or public.fbla_can_manage(v_test.chapter_id, v_test.event)) then
      raise exception 'test not found' using errcode = '42501';
    end if;
  end if;

  v_applies_elo := v_kind not in ('custom', 'duel');
  v_elo := v_prof.elo;
  v_elo_before := v_prof.elo;
  v_ef := coalesce(v_prof.elo_exact, v_prof.elo);
  v_peak := v_prof.peak_elo;
  v_ans_streak := v_prof.answer_streak;
  v_best_ans := v_prof.best_answer_streak;

  insert into public.fbla_attempts (user_id, kind, event, label, custom_test_id, assignment_id, duel_id,
                                    elo_before, elo_after)
  values (v_uid, v_kind, coalesce(v_event, v_test.event), v_label, v_test_id, v_assign_id, v_duel_id,
          v_elo, v_elo)
  returning id into v_attempt;

  for a in select value as v from jsonb_array_elements(p->'answers') loop
    v_qid := a.v->>'question_id';
    if v_qid is null then raise exception 'answer without question_id' using errcode = '22023'; end if;
    -- the same question twice in one attempt counts once
    if v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;
    v_chosen := case when jsonb_typeof(a.v->'chosen') = 'number'
                      and (a.v->>'chosen')::numeric between 0 and 3 then (a.v->>'chosen')::numeric::int end;
    v_ms := case when jsonb_typeof(a.v->'ms') = 'number'
                 then least(greatest((a.v->>'ms')::numeric, 0), 600000)::int else 0 end;
    v_delta := 0;
    v_src := null;

    if v_qid like 'custom:%' then
      -- custom:<testId>:<n>, n = 0-based index into the test's questions
      v_parts := string_to_array(v_qid, ':');
      if cardinality(v_parts) <> 3 or v_parts[3] !~ '^[0-9]+$' then
        raise exception 'bad custom question id %', v_qid using errcode = '22023';
      end if;
      if v_test.id is null or v_test.id::text <> v_parts[2] then
        select * into v_test from public.fbla_custom_tests where id::text = v_parts[2];
        if not found or not public.fbla_in_chapter(v_test.chapter_id)
           or not (v_test.published or public.fbla_can_manage(v_test.chapter_id, v_test.event)) then
          raise exception 'test not found' using errcode = '42501';
        end if;
      end if;
      v_cq := v_test.questions -> (v_parts[3]::int);
      if v_cq is null then raise exception 'unknown question %', v_qid using errcode = '22023'; end if;
      v_key := (v_cq->>'answer')::int;
      v_sub := nullif(v_cq->>'sub', '');
      v_diff := null;
      v_ev := v_test.event;
      v_explain := v_cq->>'explain';
      v_src := nullif(v_cq->>'src', '');
    else
      select * into v_q from public.fbla_questions where id = v_qid;
      if not found then raise exception 'unknown question %', v_qid using errcode = '22023'; end if;
      if v_q.answer is null then raise exception 'question % has no answer key', v_qid; end if;
      v_key := v_q.answer;
      v_sub := v_q.sub;
      v_diff := v_q.diff;
      v_ev := v_q.event;
      v_explain := v_q.explain;
    end if;

    -- a question already checked during this run (fbla_check_answer) is graded with that first answer
    v_first := not exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = v_qid);
    select * into r from public.fbla_question_reveals where user_id = v_uid and question_id = v_qid for update;
    if found then
      if v_kind <> 'duel' and r.pending and r.revealed_at > now() - interval '24 hours' then
        v_chosen := r.chosen;
        v_first := v_first and r.rated;
      else
        v_first := false;
      end if;
      update public.fbla_question_reveals set pending = false, rated = false
        where user_id = v_uid and question_id = v_qid;
    end if;

    v_ok := v_chosen is not null and v_chosen = v_key;

    if v_applies_elo and v_qid not like 'custom:%' then
      -- K = 24 on the first graded answer to a question, 0 afterwards (and for keys seen beforehand)
      v_k := case when v_first then 24 else 0 end;
      if v_k > 0 then
        v_qr := case v_diff when 1 then -200 when 3 then 200 else 0 end;
        v_exp := 1.0 / (1.0 + power(10.0::double precision, (v_qr - v_ef) / 400.0));
        v_new_f := greatest(0::double precision, v_ef + v_k * ((case when v_ok then 1 else 0 end) - v_exp));
        v_delta := round(v_new_f::numeric)::int - round(v_ef::numeric)::int;
        v_ef := v_new_f;
        v_elo := round(v_ef::numeric)::int;
        v_peak := greatest(v_peak, v_elo);
      end if;
    end if;

    insert into public.fbla_answers (attempt_id, user_id, question_id, event, sub, diff, chosen, correct, ms, elo_delta)
    values (v_attempt, v_uid, v_qid, v_ev, v_sub, v_diff, v_chosen, v_ok, v_ms, v_delta);
    if v_src is not null then perform fbla_private.fbla_mark_revealed(v_uid, array[v_src]); end if;

    v_total := v_total + 1;
    v_ms_sum := v_ms_sum + v_ms;
    if v_ok then
      v_correct := v_correct + 1;
      v_ans_streak := v_ans_streak + 1;
      v_best_ans := greatest(v_best_ans, v_ans_streak);
    else
      v_ans_streak := 0;
    end if;
    v_out := v_out || jsonb_build_object('question_id', v_qid, 'correct', v_ok, 'chosen', v_chosen,
      'correct_choice', v_key, 'elo_delta', v_delta, 'explain', v_explain);
  end loop;

  v_duration := case when jsonb_typeof(p->'duration_ms') = 'number'
                     then least(greatest((p->>'duration_ms')::numeric, 0), v_total * 600000::numeric)::bigint
                     else v_ms_sum end;

  update public.fbla_attempts
    set total = v_total, correct = v_correct, duration_ms = v_duration, elo_after = v_elo
    where id = v_attempt;

  v_streak := case
    when v_prof.last_active_date = v_today then greatest(v_prof.current_streak, 1)
    when v_prof.last_active_date = v_today - 1 then v_prof.current_streak + 1
    else 1 end;

  update public.fbla_profiles set
    elo = v_elo,
    elo_exact = v_ef,
    peak_elo = greatest(peak_elo, v_peak, v_elo),
    questions_answered = questions_answered + v_total,
    questions_correct = questions_correct + v_correct,
    time_spent_ms = time_spent_ms + v_duration,
    current_streak = v_streak,
    best_streak = greatest(best_streak, v_streak),
    answer_streak = v_ans_streak,
    best_answer_streak = v_best_ans,
    last_active_date = v_today,
    last_seen_at = now()
  where id = v_uid;

  -- attempt achievements (stat thresholds are awarded by the profiles trigger)
  perform public.fbla_award_achievement(v_uid, 'first_steps');
  if v_total >= 10 and v_correct = v_total then
    perform public.fbla_award_achievement(v_uid, 'perfect_paper');
  end if;
  if v_kind = 'mock' and v_total >= 20 and v_correct >= 0.9 * v_total then
    perform public.fbla_award_achievement(v_uid, 'mock_90');
  end if;
  if v_total >= 20 and v_duration <= 15000::bigint * v_total and v_correct >= 0.8 * v_total then
    perform public.fbla_award_achievement(v_uid, 'speed_run');
  end if;
  if (select count(distinct event) from public.fbla_answers where user_id = v_uid and question_id not like 'custom:%')
     >= (select count(distinct event) from public.fbla_questions) then
    perform public.fbla_award_achievement(v_uid, 'all_events');
  end if;

  -- earned in this transaction (earned_at defaults to now(), the transaction start)
  select coalesce(array_agg(x.code order by d.sort), '{}') into v_codes
    from public.fbla_achievements x join public.fbla_achievement_defs d using (code)
    where x.user_id = v_uid and x.earned_at = now();

  return jsonb_build_object(
    'attempt_id', v_attempt, 'correct', v_correct, 'total', v_total, 'duration_ms', v_duration,
    'elo_before', v_elo_before, 'elo_after', v_elo, 'answers', v_out, 'achievements', to_jsonb(v_codes),
    'current_streak', v_streak);
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'fbla_check_answer(text, integer)', 'fbla_question_keys(text[], uuid)', 'fbla_question_bank(text)',
    'fbla_submit_attempt(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
