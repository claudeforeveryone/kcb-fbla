-- 0007 core RPCs: achievements, profiles, attempt grading + Elo, leaderboards, weak spots, profile stats,
-- chapter invite/join helpers. Every client-callable function is security definer, search_path '' and
-- executable by `authenticated` only.

-- ---------------------------------------------------------------- fixes to 0006 triggers
-- These guards check `current_user = 'authenticated'` to tell a direct client write from a write made inside a
-- security-definer RPC, so they must run as the caller (security invoker).
alter function public.fbla_members_guard() security invoker;
alter function public.fbla_chapters_before_insert() security invoker;
alter function public.fbla_set_author() security invoker;
alter function public.fbla_bans_before_insert() security invoker;
-- called from the invoker trigger above, reads columns clients can't
alter function public.fbla_new_join_code() security definer;
alter function public.fbla_new_invite_token() security definer;

-- usernames: lowercase, [a-z0-9_]{3,20}, a few reserved words
create or replace function public.fbla_username_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^[a-z0-9_]{3,20}$' and p not in (
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'fbla', 'fblc', 'kcb', 'kcbfbla',
    'moderator', 'mod', 'staff', 'null', 'undefined', 'anonymous', 'settings', 'career', 'login', 'signup')
$$;

create or replace function public.fbla_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.username := lower(btrim(new.username));
  new.display_name := btrim(new.display_name);
  if (tg_op = 'INSERT' or new.username is distinct from old.username) and not public.fbla_username_ok(new.username) then
    raise exception 'usernames are 3-20 characters: lowercase letters, numbers and _' using errcode = '22023';
  end if;
  if new.main_event is not null and not public.fbla_is_event(new.main_event) then
    raise exception 'unknown event %', new.main_event using errcode = '22023';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- achievements
insert into public.fbla_achievement_defs (code, title, description, icon, sort) values
  ('first_steps',      'First Steps',        'Finish your first practice set.',                                  'Footprints',     1),
  ('questions_100',    'Century',            'Answer 100 questions.',                                            'Target',         2),
  ('questions_500',    'Five Hundred Club',  'Answer 500 questions.',                                            'Layers',         3),
  ('questions_1000',   'Thousand Strong',    'Answer 1,000 questions.',                                          'Mountain',       4),
  ('perfect_paper',    'Perfect Paper',      'Score 100% on a set of 10 or more questions.',                     'BadgeCheck',     5),
  ('streak_3',         'On a Roll',          'Practise 3 days in a row.',                                        'Flame',          6),
  ('streak_7',         'Week Warrior',       'Practise 7 days in a row.',                                        'CalendarCheck',  7),
  ('streak_30',        'Unstoppable',        'Practise 30 days in a row.',                                       'Crown',          8),
  ('answer_streak_10', 'Hot Hand',           'Get 10 answers right in a row.',                                   'Zap',            9),
  ('answer_streak_25', 'In the Zone',        'Get 25 answers right in a row.',                                   'Sparkles',      10),
  ('elo_300',          'Rising Star',        'Reach 300 Elo.',                                                   'Star',          11),
  ('elo_500',          'Contender',          'Reach 500 Elo.',                                                   'TrendingUp',    12),
  ('elo_700',          'Elite',              'Reach 700 Elo.',                                                   'Gem',           13),
  ('duel_win_1',       'Duelist',            'Win your first Arena duel.',                                       'Swords',        14),
  ('duel_win_10',      'Arena Champion',     'Win 10 Arena duels.',                                              'Trophy',        15),
  ('all_events',       'Explorer',           'Answer questions in every event.',                                 'Compass',       16),
  ('mock_90',          'Competition Ready',  'Score 90% or higher on a mock exam.',                              'GraduationCap', 17),
  ('speed_run',        'Quick Draw',         'Average under 15 seconds a question on 20+ questions with 80% right.', 'Timer',     18),
  ('chapter_joined',   'Team Player',        'Join a chapter.',                                                  'Users',         19),
  ('vocab_100',        'Word Smith',         'Master 100 vocab terms.',                                          'BookOpen',      20)
on conflict (code) do update set title = excluded.title, description = excluded.description,
  icon = excluded.icon, sort = excluded.sort;

-- server-only: award once, notify on first award. Returns true when newly earned.
create or replace function public.fbla_award_achievement(p_user uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare d public.fbla_achievement_defs;
begin
  insert into public.fbla_achievements (user_id, code) values (p_user, p_code)
  on conflict do nothing;
  if not found then return false; end if;
  select * into d from public.fbla_achievement_defs where code = p_code;
  perform public.fbla_notify(p_user, 'achievement', 'Achievement unlocked: ' || d.title, d.description,
    '/me', jsonb_build_object('code', p_code, 'icon', d.icon));
  return true;
end $$;

-- stat thresholds, whenever the stats change (attempts, duels, anything)
create or replace function public.fbla_profiles_achievements()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.questions_answered >= 100 then perform public.fbla_award_achievement(new.id, 'questions_100'); end if;
  if new.questions_answered >= 500 then perform public.fbla_award_achievement(new.id, 'questions_500'); end if;
  if new.questions_answered >= 1000 then perform public.fbla_award_achievement(new.id, 'questions_1000'); end if;
  if new.current_streak >= 3 then perform public.fbla_award_achievement(new.id, 'streak_3'); end if;
  if new.current_streak >= 7 then perform public.fbla_award_achievement(new.id, 'streak_7'); end if;
  if new.current_streak >= 30 then perform public.fbla_award_achievement(new.id, 'streak_30'); end if;
  if new.best_answer_streak >= 10 then perform public.fbla_award_achievement(new.id, 'answer_streak_10'); end if;
  if new.best_answer_streak >= 25 then perform public.fbla_award_achievement(new.id, 'answer_streak_25'); end if;
  if new.elo >= 300 then perform public.fbla_award_achievement(new.id, 'elo_300'); end if;
  if new.elo >= 500 then perform public.fbla_award_achievement(new.id, 'elo_500'); end if;
  if new.elo >= 700 then perform public.fbla_award_achievement(new.id, 'elo_700'); end if;
  if new.duel_wins >= 1 then perform public.fbla_award_achievement(new.id, 'duel_win_1'); end if;
  if new.duel_wins >= 10 then perform public.fbla_award_achievement(new.id, 'duel_win_10'); end if;
  return new;
end $$;
create trigger fbla_profiles_achievements after update on public.fbla_profiles
  for each row
  when (new.questions_answered is distinct from old.questions_answered
     or new.current_streak is distinct from old.current_streak
     or new.best_answer_streak is distinct from old.best_answer_streak
     or new.elo is distinct from old.elo
     or new.duel_wins is distinct from old.duel_wins)
  execute function public.fbla_profiles_achievements();

-- a term counts as mastered from Leitner box 4
create or replace function public.fbla_vocab_achievements()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.box >= 4 and (select count(*) from public.fbla_vocab_progress where user_id = new.user_id and box >= 4) >= 100 then
    perform public.fbla_award_achievement(new.user_id, 'vocab_100');
  end if;
  return new;
end $$;
create trigger fbla_vocab_achievements after insert or update of box on public.fbla_vocab_progress
  for each row when (new.box >= 4) execute function public.fbla_vocab_achievements();

-- ---------------------------------------------------------------- profiles
create or replace function public.fbla_username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fbla_username_ok(lower(btrim(p_username))) and not exists (
    select 1 from public.fbla_profiles
    where username = lower(btrim(p_username)) and id is distinct from (select auth.uid())
  )
$$;

-- onboarding: creates the caller's profile, or updates its cosmetic fields when it already exists
create or replace function public.fbla_create_profile(
  p_username text, p_display_name text, p_school text default null, p_grade int default null,
  p_main_event text default null
) returns public.fbla_profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(btrim(p_username));
  out public.fbla_profiles;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.fbla_username_ok(v_name) then
    raise exception 'usernames are 3-20 characters: lowercase letters, numbers and _' using errcode = '22023';
  end if;
  if exists (select 1 from public.fbla_profiles where username = v_name and id <> v_uid) then
    raise exception 'that username is taken' using errcode = '23505';
  end if;
  insert into public.fbla_profiles (id, username, display_name, school, grade, main_event)
  values (v_uid, v_name, coalesce(nullif(btrim(p_display_name), ''), v_name), nullif(btrim(p_school), ''),
          p_grade, nullif(p_main_event, ''))
  on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
    school = excluded.school, grade = excluded.grade, main_event = excluded.main_event
  returning * into out;
  return out;
end $$;

-- ---------------------------------------------------------------- grading + Elo
-- Elo (mirror: src/lib/elo.ts): question rating easy -200, medium 0, hard +200; K 24 on the first try at a
-- question, 8 on repeats; expected = 1/(1+10^((q-r)/400)); r = max(0, round(r + K*(score - expected))),
-- applied answer by answer. Only official questions, and never for kinds custom or duel.
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
  v_test public.fbla_custom_tests;
  v_q public.fbla_questions;
  v_cq jsonb;
  v_parts text[];
  v_attempt uuid;
  v_applies_elo boolean;
  v_elo int;
  v_elo_before int;
  v_ans_streak int;
  v_best_ans int;
  v_total int := 0;
  v_correct int := 0;
  v_ms_sum bigint := 0;
  v_duration bigint;
  v_out jsonb := '[]'::jsonb;
  a record;
  v_qid text;
  v_chosen int;
  v_ms int;
  v_ok boolean;
  v_key int;
  v_sub text;
  v_diff smallint;
  v_ev text;
  v_explain text;
  v_delta int;
  v_k int;
  v_qr double precision;
  v_exp double precision;
  v_new int;
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
  if v_test_id is not null then
    select * into v_test from public.fbla_custom_tests where id = v_test_id;
    if not found or not public.fbla_in_chapter(v_test.chapter_id) then
      raise exception 'test not found' using errcode = '42501';
    end if;
  end if;
  if v_assign_id is not null and not exists (
    select 1 from public.fbla_assignments where id = v_assign_id and public.fbla_in_chapter(chapter_id)) then
    raise exception 'assignment not found' using errcode = '42501';
  end if;
  if v_duel_id is not null and not exists (
    select 1 from public.fbla_duels where id = v_duel_id and v_uid in (challenger_id, opponent_id)) then
    raise exception 'duel not found' using errcode = '42501';
  end if;

  v_applies_elo := v_kind not in ('custom', 'duel');
  v_elo := v_prof.elo;
  v_elo_before := v_prof.elo;
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
    v_chosen := case when jsonb_typeof(a.v->'chosen') = 'number' then (a.v->>'chosen')::numeric::int end;
    v_ms := case when jsonb_typeof(a.v->'ms') = 'number'
                 then least(greatest((a.v->>'ms')::numeric, 0), 600000)::int else 0 end;
    v_delta := 0;

    if v_qid like 'custom:%' then
      -- custom:<testId>:<n>, n = 0-based index into the test's questions
      v_parts := string_to_array(v_qid, ':');
      if cardinality(v_parts) <> 3 or v_parts[3] !~ '^[0-9]+$' then
        raise exception 'bad custom question id %', v_qid using errcode = '22023';
      end if;
      if v_test.id is null or v_test.id::text <> v_parts[2] then
        select * into v_test from public.fbla_custom_tests where id::text = v_parts[2];
        if not found or not public.fbla_in_chapter(v_test.chapter_id) then
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

    v_ok := v_chosen is not null and v_chosen = v_key;

    if v_applies_elo and v_qid not like 'custom:%' then
      v_k := case when exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = v_qid)
                  then 8 else 24 end;
      v_qr := case v_diff when 1 then -200 when 3 then 200 else 0 end;
      v_exp := 1.0 / (1.0 + power(10.0::double precision, (v_qr - v_elo) / 400.0));
      v_new := greatest(0, round((v_elo + v_k * ((case when v_ok then 1 else 0 end) - v_exp))::numeric)::int);
      v_delta := v_new - v_elo;
      v_elo := v_new;
    end if;

    insert into public.fbla_answers (attempt_id, user_id, question_id, event, sub, diff, chosen, correct, ms, elo_delta)
    values (v_attempt, v_uid, v_qid, v_ev, v_sub, v_diff, v_chosen, v_ok, v_ms, v_delta);

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
    peak_elo = greatest(peak_elo, v_elo),
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

-- ---------------------------------------------------------------- leaderboards
-- p_event: rank by Elo earned in that event (sum of its answer deltas, floored at 0) and that event's counts
create or replace function public.fbla_player_leaderboard(
  p_limit int default 50, p_offset int default 0, p_event text default null, p_chapter uuid default null
) returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text, school text, grade smallint,
  main_event text, chapter_id uuid, chapter_name text, elo int, peak_elo int, questions_answered int,
  questions_correct int, accuracy numeric, current_streak int, is_me boolean, total_count bigint
) language sql stable security definer set search_path = '' as $$
  with base as (
    select p.id, p.username, p.display_name, p.avatar_url, p.school, p.grade, p.main_event, p.chapter_id,
           p.peak_elo, p.current_streak, p.created_at,
           case when p_event is null then p.elo else e.elo end as elo,
           case when p_event is null then p.questions_answered else e.answered end as answered,
           case when p_event is null then p.questions_correct else e.correct end as correct
    from public.fbla_profiles p
    left join lateral (
      select greatest(0, coalesce(sum(a.elo_delta), 0))::int as elo, count(*)::int as answered,
             (count(*) filter (where a.correct))::int as correct
      from public.fbla_answers a
      where p_event is not null and a.user_id = p.id and a.event = p_event and a.question_id not like 'custom:%'
    ) e on true
    where (p_chapter is null or p.chapter_id = p_chapter)
  ), ranked as (
    select b.*,
           rank() over (order by b.elo desc, b.answered desc) as rnk,
           count(*) over () as total
    from base b
    where p_event is null or b.answered > 0
  )
  select r.rnk, r.id, r.username, r.display_name, r.avatar_url, r.school, r.grade, r.main_event, r.chapter_id,
         c.name, r.elo, r.peak_elo, r.answered, r.correct,
         case when r.answered > 0 then round(r.correct::numeric / r.answered, 4) else 0 end,
         r.current_streak, r.id = (select auth.uid()), r.total
  from ranked r
  left join public.fbla_chapters c on c.id = r.chapter_id
  order by r.rnk, r.answered desc, r.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.fbla_chapter_leaderboard(p_limit int default 50, p_offset int default 0)
returns table (
  rank bigint, chapter_id uuid, name text, school text, region text, member_count int, total_elo bigint,
  avg_elo int, questions_answered bigint, top_user_id uuid, top_username text, top_display_name text,
  top_avatar_url text, top_elo int, is_mine boolean, total_count bigint
) language sql stable security definer set search_path = '' as $$
  with agg as (
    select c.id, c.name, c.school, c.region, c.created_at,
           count(p.id)::int as members,
           coalesce(sum(p.elo), 0)::bigint as total_elo,
           coalesce(round(avg(p.elo)), 0)::int as avg_elo,
           coalesce(sum(p.questions_answered), 0)::bigint as answered
    from public.fbla_chapters c
    left join public.fbla_chapter_members m on m.chapter_id = c.id
    left join public.fbla_profiles p on p.id = m.user_id
    group by c.id
  ), ranked as (
    select a.*, rank() over (order by a.total_elo desc, a.avg_elo desc) as rnk, count(*) over () as total
    from agg a
  )
  select r.rnk, r.id, r.name, r.school, r.region, r.members, r.total_elo, r.avg_elo, r.answered,
         t.id, t.username, t.display_name, t.avatar_url, t.elo,
         r.id = (select public.fbla_my_chapter()), r.total
  from ranked r
  left join lateral (
    select p.id, p.username, p.display_name, p.avatar_url, p.elo
    from public.fbla_chapter_members m join public.fbla_profiles p on p.id = m.user_id
    where m.chapter_id = r.id
    order by p.elo desc, p.questions_answered desc
    limit 1
  ) t on true
  order by r.rnk, r.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- weak spots
create or replace function public.fbla_weak_spots(p_user uuid default null)
returns table (
  event text, sub text, answered int, correct int, accuracy numeric, attempts int, last_answered_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is null or not public.fbla_can_view_member(v_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.event, a.sub, count(*)::int, (count(*) filter (where a.correct))::int,
           round((count(*) filter (where a.correct))::numeric / count(*), 4),
           count(distinct a.attempt_id)::int, max(a.created_at)
    from public.fbla_answers a
    where a.user_id = v_user and a.question_id not like 'custom:%' and a.event is not null and a.sub is not null
    group by a.event, a.sub
    order by 5 asc, 3 desc, 1, 2;
end $$;

-- ---------------------------------------------------------------- profile stats
-- Anyone signed in can see the public parts; per-area accuracy and recent attempts only for self or chapter staff.
create or replace function public.fbla_profile_stats(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_prof public.fbla_profiles;
  v_private boolean;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_prof from public.fbla_profiles where id = v_user;
  if not found then return null; end if;
  v_private := public.fbla_can_view_member(v_user);

  select jsonb_build_object(
    'profile', to_jsonb(v_prof) - case when v_user = auth.uid() then '' else 'email_opt_in' end,
    'chapter', (select jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role)
                from public.fbla_chapter_members m join public.fbla_chapters c on c.id = m.chapter_id
                where m.user_id = v_user),
    'rank', (select count(*) + 1 from public.fbla_profiles where elo > v_prof.elo),
    'players', (select count(*) from public.fbla_profiles),
    'questions_answered', v_prof.questions_answered,
    'questions_correct', v_prof.questions_correct,
    'accuracy', case when v_prof.questions_answered > 0
                     then round(v_prof.questions_correct::numeric / v_prof.questions_answered, 4) else 0 end,
    'time_spent_ms', v_prof.time_spent_ms,
    'current_streak', case when v_prof.last_active_date >= public.fbla_today() - 1 then v_prof.current_streak else 0 end,
    'best_streak', v_prof.best_streak,
    'best_answer_streak', v_prof.best_answer_streak,
    'attempts_count', (select count(*) from public.fbla_attempts where user_id = v_user),
    'by_event', coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4), 'elo', x.elo) order by x.n desc)
      from (select a.event, count(*)::int n, (count(*) filter (where a.correct))::int c,
                   greatest(0, sum(a.elo_delta))::int elo
            from public.fbla_answers a
            where a.user_id = v_user and a.event is not null and a.question_id not like 'custom:%'
            group by a.event) x), '[]'::jsonb),
    'by_sub', case when v_private then coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'sub', x.sub, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4)) order by x.event, x.sub)
      from (select a.event, a.sub, count(*)::int n, (count(*) filter (where a.correct))::int c
            from public.fbla_answers a
            where a.user_id = v_user and a.event is not null and a.sub is not null and a.question_id not like 'custom:%'
            group by a.event, a.sub) x), '[]'::jsonb) else null end,
    'best_paper', (
      select jsonb_build_object('attempt_id', t.id, 'kind', t.kind, 'event', t.event, 'label', t.label,
               'correct', t.correct, 'total', t.total, 'accuracy', round(t.correct::numeric / t.total, 4),
               'created_at', t.created_at)
      from public.fbla_attempts t
      where t.user_id = v_user and t.total >= 10
      order by t.correct::numeric / t.total desc, t.total desc, t.created_at desc limit 1),
    'elo_history', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'elo', d.elo) order by d.day)
      from (select distinct on ((t.created_at at time zone 'America/Toronto')::date)
                   (t.created_at at time zone 'America/Toronto')::date as day, t.elo_after as elo
            from public.fbla_attempts t
            where t.user_id = v_user and t.created_at > now() - interval '365 days'
            order by (t.created_at at time zone 'America/Toronto')::date, t.created_at desc) d), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'answered', d.n) order by d.day)
      from (select (a.created_at at time zone 'America/Toronto')::date as day, count(*)::int n
            from public.fbla_answers a
            where a.user_id = v_user and a.created_at > now() - interval '182 days'
            group by 1) d), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.code, 'earned_at', x.earned_at) order by x.earned_at desc)
      from public.fbla_achievements x where x.user_id = v_user), '[]'::jsonb),
    'recent_attempts', case when v_private then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (select t.id, t.kind, t.event, t.label, t.total, t.correct, t.duration_ms, t.elo_before, t.elo_after,
                   t.created_at
            from public.fbla_attempts t where t.user_id = v_user
            order by t.created_at desc limit 10) r), '[]'::jsonb) else null end,
    'can_view_private', v_private
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------- chapter invite / join helpers
-- (join_code and invite_token are not readable by clients directly)
create or replace function public.fbla_chapter_invite(p_chapter uuid)
returns table (join_code text, invite_token text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fbla_is_chapter_admin(p_chapter) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select c.join_code, c.invite_token from public.fbla_chapters c where c.id = p_chapter;
end $$;

create or replace function public.fbla_rotate_chapter_invite(p_chapter uuid, p_what text default 'both')
returns table (join_code text, invite_token text) language plpgsql security definer set search_path = '' as $$
begin
  if not public.fbla_is_chapter_admin(p_chapter) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.fbla_chapters c set
    join_code = case when p_what in ('code', 'both') then public.fbla_new_join_code() else c.join_code end,
    invite_token = case when p_what in ('token', 'both') then public.fbla_new_invite_token() else c.invite_token end
  where c.id = p_chapter;
  return query select c.join_code, c.invite_token from public.fbla_chapters c where c.id = p_chapter;
end $$;

-- look up a chapter by its 6-character code or invite token (for the join landing page)
create or replace function public.fbla_chapter_preview(p_code text)
returns table (id uuid, name text, school text, region text, description text, member_count int,
               president_name text, is_banned boolean, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.school, c.region, c.description,
         (select count(*)::int from public.fbla_chapter_members m where m.chapter_id = c.id),
         (select p.display_name from public.fbla_profiles p where p.id = c.president_id),
         exists (select 1 from public.fbla_chapter_bans b where b.chapter_id = c.id and b.user_id = (select auth.uid())),
         exists (select 1 from public.fbla_chapter_members m where m.chapter_id = c.id and m.user_id = (select auth.uid()))
  from public.fbla_chapters c
  where c.join_code = upper(btrim(p_code)) or c.invite_token = btrim(p_code)
  limit 1
$$;

create or replace function public.fbla_join_chapter(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_chapter public.fbla_chapters;
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select display_name into v_name from public.fbla_profiles where id = v_uid;
  if not found then raise exception 'create your profile first' using errcode = '42501'; end if;
  select * into v_chapter from public.fbla_chapters
    where join_code = upper(btrim(p_code)) or invite_token = btrim(p_code) limit 1;
  if not found then raise exception 'that code does not match a chapter' using errcode = 'P0002'; end if;
  if exists (select 1 from public.fbla_chapter_members where user_id = v_uid) then
    if exists (select 1 from public.fbla_chapter_members where user_id = v_uid and chapter_id = v_chapter.id) then
      return v_chapter.id;
    end if;
    raise exception 'leave your current chapter first' using errcode = '23505';
  end if;
  if exists (select 1 from public.fbla_chapter_bans where chapter_id = v_chapter.id and user_id = v_uid) then
    raise exception 'you are banned from this chapter' using errcode = '42501';
  end if;
  insert into public.fbla_chapter_members (chapter_id, user_id, role) values (v_chapter.id, v_uid, 'member');
  perform public.fbla_notify(m.user_id, 'chapter_join', v_name || ' joined ' || v_chapter.name, null,
    '/chapter/admin', jsonb_build_object('chapter_id', v_chapter.id, 'user_id', v_uid))
  from public.fbla_chapter_members m
  where m.chapter_id = v_chapter.id and m.role in ('president', 'executive');
  return v_chapter.id;
end $$;

-- leave; a president can only leave when alone, which deletes the chapter
create or replace function public.fbla_leave_chapter()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.fbla_chapter_members;
begin
  select * into m from public.fbla_chapter_members where user_id = v_uid;
  if not found then return; end if;
  if m.role = 'president' then
    if exists (select 1 from public.fbla_chapter_members where chapter_id = m.chapter_id and user_id <> v_uid) then
      raise exception 'transfer the presidency before leaving' using errcode = '42501';
    end if;
    delete from public.fbla_chapters where id = m.chapter_id;
  else
    delete from public.fbla_chapter_members where user_id = v_uid;
  end if;
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'fbla_today()', 'fbla_is_event(text)', 'fbla_username_ok(text)',
    'fbla_my_chapter()', 'fbla_my_role()', 'fbla_is_chapter_admin(uuid)', 'fbla_is_chapter_staff(uuid, text)',
    'fbla_can_view_member(uuid)', 'fbla_in_chapter(uuid)',
    'fbla_notify(uuid, text, text, text, text, jsonb)', 'fbla_award_achievement(uuid, text)',
    'fbla_new_join_code()', 'fbla_new_invite_token()',
    'fbla_profiles_guard()', 'fbla_chapters_before_insert()', 'fbla_chapters_after_insert()',
    'fbla_members_guard()', 'fbla_members_mirror()', 'fbla_bans_after_insert()', 'fbla_bans_before_insert()',
    'fbla_trainers_guard()', 'fbla_trainers_sync_role()', 'fbla_touch_updated_at()', 'fbla_set_author()',
    'fbla_profiles_achievements()', 'fbla_vocab_achievements()',
    'fbla_username_available(text)', 'fbla_create_profile(text, text, text, integer, text)',
    'fbla_submit_attempt(jsonb)', 'fbla_player_leaderboard(integer, integer, text, uuid)',
    'fbla_chapter_leaderboard(integer, integer)', 'fbla_weak_spots(uuid)', 'fbla_profile_stats(uuid)',
    'fbla_chapter_invite(uuid)', 'fbla_rotate_chapter_invite(uuid, text)', 'fbla_chapter_preview(text)',
    'fbla_join_chapter(text)', 'fbla_leave_chapter()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- RLS helpers + RPCs (the code generators are called from the invoker chapter-insert trigger)
  foreach f in array array[
    'fbla_new_join_code()', 'fbla_new_invite_token()', 'fbla_today()', 'fbla_is_event(text)', 'fbla_username_ok(text)',
    'fbla_my_chapter()', 'fbla_my_role()', 'fbla_is_chapter_admin(uuid)', 'fbla_is_chapter_staff(uuid, text)',
    'fbla_can_view_member(uuid)', 'fbla_in_chapter(uuid)',
    'fbla_username_available(text)', 'fbla_create_profile(text, text, text, integer, text)',
    'fbla_submit_attempt(jsonb)', 'fbla_player_leaderboard(integer, integer, text, uuid)',
    'fbla_chapter_leaderboard(integer, integer)', 'fbla_weak_spots(uuid)', 'fbla_profile_stats(uuid)',
    'fbla_chapter_invite(uuid)', 'fbla_rotate_chapter_invite(uuid, text)', 'fbla_chapter_preview(text)',
    'fbla_join_chapter(text)', 'fbla_leave_chapter()'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
