-- 0010 Arena: 1v1 duels and friends.
--
-- Flow: fbla_challenge -> (opponent) fbla_respond_duel -> each player fbla_start_duel + fbla_submit_duel
-- (asynchronously, same 10 questions) -> settled when both are in: most correct wins, tie broken by lower
-- server-measured time, exact tie is a draw. Pending challenges expire after 24h; accepted duels must be played
-- within 48h of acceptance (a no-show loses by forfeit if the other side played). Expiry is lazy: every Arena RPC
-- and fbla_arena_sweep() settle anything overdue (no pg_cron on this project).
--
-- Grading reuses fbla_submit_attempt (kind 'duel': no Elo, but it counts toward questions answered, streaks and
-- the career list). Per-question results live in fbla_duel_runs and the opponent's run is only readable once the
-- duel is complete. Clients never write the Arena tables directly; everything goes through these RPCs.
--
-- Applied live in four parts (fbla_0010_arena_schema, _duel_rpcs, _friend_rpcs, _start_idempotent); this file is
-- their combined final state.
--
-- Notification kinds: duel_challenge, duel_accepted, duel_declined, duel_turn, duel_result, duel_expired,
-- friend_request, friend_accepted.

-- ---------------------------------------------------------------- duels: extra columns
alter table public.fbla_duels
  add column if not exists time_limit_sec integer not null default 300 check (time_limit_sec between 60 and 1800),
  add column if not exists message text check (char_length(message) <= 140),
  add column if not exists forfeit_by uuid references public.fbla_profiles (id) on delete set null;
create index if not exists fbla_duels_forfeit_idx on public.fbla_duels (forfeit_by);

-- ---------------------------------------------------------------- per-player runs
create table if not exists public.fbla_duel_runs (
  duel_id uuid not null references public.fbla_duels (id) on delete cascade,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score integer,
  ms integer,
  -- [{question_id, chosen, correct, correct_choice, ms}] in duel question order
  answers jsonb not null default '[]'::jsonb,
  attempt_id uuid references public.fbla_attempts (id) on delete set null,
  primary key (duel_id, user_id)
);
create index if not exists fbla_duel_runs_user_idx on public.fbla_duel_runs (user_id);
create index if not exists fbla_duel_runs_attempt_idx on public.fbla_duel_runs (attempt_id);
create index if not exists fbla_duel_runs_open_idx on public.fbla_duel_runs (started_at) where finished_at is null;
alter table public.fbla_duel_runs enable row level security;
revoke all on public.fbla_duel_runs from anon;
revoke insert, update, delete on public.fbla_duel_runs from authenticated;
grant select on public.fbla_duel_runs to authenticated;

drop policy if exists fbla_duel_runs_read on public.fbla_duel_runs;
create policy fbla_duel_runs_read on public.fbla_duel_runs for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.fbla_duels d
    where d.id = duel_id and d.status = 'complete'
      and (select auth.uid()) in (d.challenger_id, d.opponent_id)));

-- Arena tables are written only through the RPCs below.
drop policy if exists fbla_duels_insert on public.fbla_duels;
revoke insert, update, delete on public.fbla_duels from authenticated;
drop policy if exists fbla_friends_insert on public.fbla_friends;
drop policy if exists fbla_friends_update on public.fbla_friends;
drop policy if exists fbla_friends_delete on public.fbla_friends;
revoke insert, update, delete on public.fbla_friends from authenticated;
create index if not exists fbla_friends_user_idx on public.fbla_friends (user_id, status);

-- live friend-request updates in the lobby (RLS still applies to realtime)
do $$ begin
  alter publication supabase_realtime add table public.fbla_friends;
exception when duplicate_object then null; end $$;
-- realtime UPDATE/DELETE payloads need the old row's keys for filters
alter table public.fbla_duels replica identity full;
alter table public.fbla_friends replica identity full;

-- ---------------------------------------------------------------- internal helpers (not callable by clients)
create or replace function fbla_private.fbla_player_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(display_name), ''), username, 'A player') from public.fbla_profiles where id = p_user
$$;

-- Settle an accepted duel once both runs are in, or when a forfeit is being applied. Idempotent.
create or replace function fbla_private.fbla_duel_settle(p_duel uuid, p_forfeit_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.fbla_duels;
  v_winner uuid;
  v_loser uuid;
  v_link text;
  v_title_c text;
  v_title_o text;
  v_cname text;
  v_oname text;
  v_score text;
begin
  select * into d from public.fbla_duels where id = p_duel for update;
  if not found or d.status <> 'accepted' then return; end if;

  if p_forfeit_by is not null then
    v_winner := case when p_forfeit_by = d.challenger_id then d.opponent_id else d.challenger_id end;
  else
    if d.challenger_score is null or d.opponent_score is null then return; end if;
    v_winner := case
      when d.challenger_score > d.opponent_score then d.challenger_id
      when d.opponent_score > d.challenger_score then d.opponent_id
      when coalesce(d.challenger_ms, 0) < coalesce(d.opponent_ms, 0) then d.challenger_id
      when coalesce(d.opponent_ms, 0) < coalesce(d.challenger_ms, 0) then d.opponent_id
      else null end;
  end if;

  update public.fbla_duels
    set status = 'complete', winner_id = v_winner, completed_at = now(), forfeit_by = p_forfeit_by
    where id = p_duel;

  if v_winner is null then
    update public.fbla_profiles set duel_draws = duel_draws + 1 where id in (d.challenger_id, d.opponent_id);
  else
    v_loser := case when v_winner = d.challenger_id then d.opponent_id else d.challenger_id end;
    update public.fbla_profiles set duel_wins = duel_wins + 1 where id = v_winner;
    update public.fbla_profiles set duel_losses = duel_losses + 1 where id = v_loser;
  end if;

  v_cname := fbla_private.fbla_player_name(d.challenger_id);
  v_oname := fbla_private.fbla_player_name(d.opponent_id);
  v_link := '/arena/' || d.id;
  v_score := coalesce(d.challenger_score::text, '-') || '-' || coalesce(d.opponent_score::text, '-');

  if p_forfeit_by is not null then
    v_title_c := case when v_winner = d.challenger_id then 'You won by forfeit against ' || v_oname
                      else 'Your duel with ' || v_oname || ' ran out of time' end;
    v_title_o := case when v_winner = d.opponent_id then 'You won by forfeit against ' || v_cname
                      else 'Your duel with ' || v_cname || ' ran out of time' end;
  elsif v_winner is null then
    v_title_c := 'Draw with ' || v_oname || ' (' || v_score || ')';
    v_title_o := 'Draw with ' || v_cname || ' (' || v_score || ')';
  else
    v_title_c := case when v_winner = d.challenger_id then 'You beat ' || v_oname else v_oname || ' won your duel' end
                 || ' (' || v_score || ')';
    v_title_o := case when v_winner = d.opponent_id then 'You beat ' || v_cname else v_cname || ' won your duel' end
                 || ' (' || d.opponent_score || '-' || d.challenger_score || ')';
  end if;

  perform public.fbla_notify(d.challenger_id, 'duel_result', v_title_c, 'See the question-by-question breakdown.',
    v_link, jsonb_build_object('duel_id', d.id, 'winner_id', v_winner, 'forfeit', p_forfeit_by is not null));
  perform public.fbla_notify(d.opponent_id, 'duel_result', v_title_o, 'See the question-by-question breakdown.',
    v_link, jsonb_build_object('duel_id', d.id, 'winner_id', v_winner, 'forfeit', p_forfeit_by is not null));
end $$;

-- Expire / auto-finish anything overdue. Cheap (partial indexes) and safe to call often.
create or replace function fbla_private.fbla_duel_sweep()
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.fbla_duels;
  r record;
begin
  -- runs whose clock ran out long ago without a submit (tab closed): score what we have, which is nothing
  for r in
    select x.duel_id, x.user_id, du.time_limit_sec
    from public.fbla_duel_runs x
    join public.fbla_duels du on du.id = x.duel_id
    where x.finished_at is null and du.status = 'accepted'
      and x.started_at + make_interval(secs => du.time_limit_sec) + interval '10 minutes' < now()
  loop
    update public.fbla_duel_runs
      set finished_at = now(), score = 0, ms = r.time_limit_sec * 1000
      where duel_id = r.duel_id and user_id = r.user_id and finished_at is null;
    update public.fbla_duels set
      challenger_score = case when challenger_id = r.user_id then 0 else challenger_score end,
      challenger_ms = case when challenger_id = r.user_id then r.time_limit_sec * 1000 else challenger_ms end,
      opponent_score = case when opponent_id = r.user_id then 0 else opponent_score end,
      opponent_ms = case when opponent_id = r.user_id then r.time_limit_sec * 1000 else opponent_ms end
      where id = r.duel_id;
    perform fbla_private.fbla_duel_settle(r.duel_id);
  end loop;

  -- unanswered challenges
  for d in
    update public.fbla_duels set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning *
  loop
    perform public.fbla_notify(d.challenger_id, 'duel_expired',
      fbla_private.fbla_player_name(d.opponent_id) || ' did not answer your challenge',
      'Challenges expire after 24 hours. Try a rematch or challenge someone else.', '/arena',
      jsonb_build_object('duel_id', d.id));
  end loop;

  -- accepted but not finished in time
  for d in
    select * from public.fbla_duels where status = 'accepted' and expires_at < now() for update skip locked
  loop
    if d.challenger_score is not null and d.opponent_score is null then
      perform fbla_private.fbla_duel_settle(d.id, d.opponent_id);
    elsif d.opponent_score is not null and d.challenger_score is null then
      perform fbla_private.fbla_duel_settle(d.id, d.challenger_id);
    elsif d.challenger_score is null and d.opponent_score is null then
      update public.fbla_duels set status = 'expired' where id = d.id;
    else
      perform fbla_private.fbla_duel_settle(d.id);
    end if;
  end loop;
end $$;

revoke all on function fbla_private.fbla_player_name(uuid) from public, anon, authenticated;
revoke all on function fbla_private.fbla_duel_settle(uuid, uuid) from public, anon, authenticated;
revoke all on function fbla_private.fbla_duel_sweep() from public, anon, authenticated;

-- ---------------------------------------------------------------- client RPCs: duels

create or replace function public.fbla_arena_sweep()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform fbla_private.fbla_duel_sweep();
end $$;

-- p_event: an event slug or 'mixed'. Returns the new duel id.
create or replace function public.fbla_challenge(
  p_opponent uuid, p_event text, p_time_limit_sec integer default 300, p_message text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids text[];
  v_id uuid;
  v_event text := lower(btrim(coalesce(p_event, 'mixed')));
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = v_uid) then
    raise exception 'create your profile first' using errcode = '42501';
  end if;
  if p_opponent is null or not exists (select 1 from public.fbla_profiles where id = p_opponent) then
    raise exception 'that player does not exist' using errcode = '22023';
  end if;
  if p_opponent = v_uid then raise exception 'you cannot challenge yourself' using errcode = '22023'; end if;
  if v_event <> 'mixed' and not public.fbla_is_event(v_event) then
    raise exception 'unknown event %', v_event using errcode = '22023';
  end if;
  if p_time_limit_sec is null or p_time_limit_sec not in (180, 300, 600) then
    raise exception 'pick a 3, 5 or 10 minute clock' using errcode = '22023';
  end if;
  if char_length(v_msg) > 140 then raise exception 'keep the message under 140 characters' using errcode = '22023'; end if;

  perform fbla_private.fbla_duel_sweep();

  if exists (select 1 from public.fbla_duels
             where status = 'pending'
               and ((challenger_id = v_uid and opponent_id = p_opponent)
                 or (challenger_id = p_opponent and opponent_id = v_uid))) then
    raise exception 'there is already an open challenge between you two' using errcode = '23505';
  end if;
  if (select count(*) from public.fbla_duels where challenger_id = v_uid and status = 'pending') >= 15 then
    raise exception 'you have 15 challenges waiting; cancel some first' using errcode = '22023';
  end if;
  if (select count(*) from public.fbla_duels where challenger_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'slow down: too many challenges this hour' using errcode = '22023';
  end if;

  select array_agg(id) into v_ids from (
    select id from public.fbla_questions
    where answer is not null and (v_event = 'mixed' or event = v_event)
    order by random() limit 10) s;
  if coalesce(cardinality(v_ids), 0) < 10 then
    raise exception 'not enough questions for that event yet' using errcode = '22023';
  end if;

  insert into public.fbla_duels (challenger_id, opponent_id, event, question_ids, time_limit_sec, message)
  values (v_uid, p_opponent, v_event, v_ids, p_time_limit_sec, v_msg)
  returning id into v_id;

  v_name := fbla_private.fbla_player_name(v_uid);
  perform public.fbla_notify(p_opponent, 'duel_challenge', v_name || ' challenged you to a duel',
    coalesce(v_msg, '10 questions, ' || (p_time_limit_sec / 60) || ' minutes. Accept within 24 hours.'),
    '/arena', jsonb_build_object('duel_id', v_id, 'from', v_uid, 'event', v_event));
  return v_id;
end $$;

create or replace function public.fbla_respond_duel(p_duel uuid, p_accept boolean)
returns public.fbla_duels language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform fbla_private.fbla_duel_sweep();
  select * into d from public.fbla_duels where id = p_duel for update;
  if not found or d.opponent_id <> v_uid then raise exception 'challenge not found' using errcode = '42501'; end if;
  if d.status = 'expired' then raise exception 'this challenge has expired' using errcode = '22023'; end if;
  if d.status <> 'pending' then raise exception 'this challenge was already answered' using errcode = '22023'; end if;

  v_name := fbla_private.fbla_player_name(v_uid);
  if coalesce(p_accept, false) then
    update public.fbla_duels set status = 'accepted', accepted_at = now(), expires_at = now() + interval '48 hours'
      where id = p_duel returning * into d;
    perform public.fbla_notify(d.challenger_id, 'duel_accepted', v_name || ' accepted your challenge',
      'Your 10 questions are ready. Play any time in the next 48 hours.', '/arena/' || d.id,
      jsonb_build_object('duel_id', d.id));
  else
    update public.fbla_duels set status = 'declined', completed_at = now() where id = p_duel returning * into d;
    perform public.fbla_notify(d.challenger_id, 'duel_declined', v_name || ' declined your challenge', null,
      '/arena', jsonb_build_object('duel_id', d.id));
  end if;
  return d;
end $$;

create or replace function public.fbla_cancel_duel(p_duel uuid)
returns public.fbla_duels language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into d from public.fbla_duels where id = p_duel for update;
  if not found or d.challenger_id <> v_uid then raise exception 'challenge not found' using errcode = '42501'; end if;
  if d.status <> 'pending' then raise exception 'only a challenge that has not been answered can be cancelled' using errcode = '22023'; end if;
  update public.fbla_duels set status = 'cancelled', completed_at = now() where id = p_duel returning * into d;
  return d;
end $$;

-- Starts (or resumes) the caller's clock. Calling it again returns the original start, so a refresh never resets
-- the timer. Returns {started_at, deadline, server_now, finished}.
create or replace function public.fbla_start_duel(p_duel uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
  r public.fbla_duel_runs;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform fbla_private.fbla_duel_sweep();
  select * into d from public.fbla_duels where id = p_duel;
  if not found or v_uid not in (d.challenger_id, d.opponent_id) then
    raise exception 'duel not found' using errcode = '42501';
  end if;
  select * into r from public.fbla_duel_runs where duel_id = p_duel and user_id = v_uid;
  if found and r.finished_at is not null then
    return jsonb_build_object('started_at', r.started_at, 'finished', true, 'server_now', now(),
      'deadline', r.started_at + make_interval(secs => d.time_limit_sec));
  end if;
  if d.status <> 'accepted' then raise exception 'this duel is not open for play' using errcode = '22023'; end if;
  -- two tabs (or a double effect) may start at once: the first insert wins, everyone reads it back
  insert into public.fbla_duel_runs (duel_id, user_id) values (p_duel, v_uid) on conflict (duel_id, user_id) do nothing;
  select * into r from public.fbla_duel_runs where duel_id = p_duel and user_id = v_uid;
  return jsonb_build_object('started_at', r.started_at, 'finished', r.finished_at is not null, 'server_now', now(),
    'deadline', r.started_at + make_interval(secs => d.time_limit_sec));
end $$;

-- p_answers: [{question_id, chosen (0-3 or null), ms}]. Grades server-side. Time used is measured by the server
-- (start to submit, capped at the clock), so it can't be faked for the tie-break.
create or replace function public.fbla_submit_duel(p_duel uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
  r public.fbla_duel_runs;
  v_is_ch boolean;
  v_limit_ms int;
  v_given jsonb := '{}'::jsonb;
  a jsonb;
  v_qid text;
  v_list jsonb := '[]'::jsonb;
  v_res jsonb;
  v_graded jsonb := '[]'::jsonb;
  g jsonb;
  v_ms int;
  v_score int;
  v_other uuid;
  v_name text;
  i int;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into d from public.fbla_duels where id = p_duel for update;
  if not found or v_uid not in (d.challenger_id, d.opponent_id) then
    raise exception 'duel not found' using errcode = '42501';
  end if;
  if d.status <> 'accepted' then raise exception 'this duel is not open for play' using errcode = '22023'; end if;
  select * into r from public.fbla_duel_runs where duel_id = p_duel and user_id = v_uid for update;
  if not found then raise exception 'start the duel first' using errcode = '22023'; end if;
  if r.finished_at is not null then raise exception 'you already played this duel' using errcode = '23505'; end if;
  if p_answers is not null and jsonb_typeof(p_answers) <> 'array' then
    raise exception 'answers must be a list' using errcode = '22023';
  end if;

  v_is_ch := v_uid = d.challenger_id;
  v_limit_ms := d.time_limit_sec * 1000;

  -- index the given answers by question id; ignore ids that are not in this duel
  for a in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    v_qid := a->>'question_id';
    if v_qid is not null and v_qid = any (d.question_ids) then
      v_given := v_given || jsonb_build_object(v_qid, a);
    end if;
  end loop;

  -- every duel question, in order; unanswered ones count as wrong
  for i in 1 .. cardinality(d.question_ids) loop
    v_qid := d.question_ids[i];
    a := v_given -> v_qid;
    v_list := v_list || jsonb_build_object(
      'question_id', v_qid,
      'chosen', case when a is not null and jsonb_typeof(a->'chosen') = 'number'
                       and (a->>'chosen')::numeric between 0 and 3 then (a->>'chosen')::numeric::int end,
      'ms', case when a is not null and jsonb_typeof(a->'ms') = 'number'
                 then least(greatest((a->>'ms')::numeric, 0), v_limit_ms)::int else 0 end);
  end loop;

  v_ms := least(greatest((extract(epoch from (now() - r.started_at)) * 1000)::bigint, 0), v_limit_ms)::int;

  v_res := public.fbla_submit_attempt(jsonb_build_object(
    'kind', 'duel',
    'event', case when d.event = 'mixed' then null else d.event end,
    'label', 'Arena duel vs ' || fbla_private.fbla_player_name(case when v_is_ch then d.opponent_id else d.challenger_id end),
    'duel_id', d.id,
    'duration_ms', v_ms,
    'answers', v_list));
  v_score := (v_res->>'correct')::int;

  for i in 0 .. jsonb_array_length(v_res->'answers') - 1 loop
    g := v_res->'answers'->i;
    v_graded := v_graded || jsonb_build_object(
      'question_id', g->>'question_id', 'chosen', g->'chosen', 'correct', g->'correct',
      'correct_choice', g->'correct_choice', 'ms', v_list->i->'ms');
  end loop;

  update public.fbla_duel_runs
    set finished_at = now(), score = v_score, ms = v_ms, answers = v_graded, attempt_id = (v_res->>'attempt_id')::uuid
    where duel_id = p_duel and user_id = v_uid;

  if v_is_ch then
    update public.fbla_duels set challenger_score = v_score, challenger_ms = v_ms where id = p_duel returning * into d;
  else
    update public.fbla_duels set opponent_score = v_score, opponent_ms = v_ms where id = p_duel returning * into d;
  end if;

  if d.challenger_score is not null and d.opponent_score is not null then
    perform fbla_private.fbla_duel_settle(p_duel);
    select * into d from public.fbla_duels where id = p_duel;
  else
    v_other := case when v_is_ch then d.opponent_id else d.challenger_id end;
    v_name := fbla_private.fbla_player_name(v_uid);
    perform public.fbla_notify(v_other, 'duel_turn', v_name || ' finished your duel. Your move.',
      'Play your 10 questions to see who wins.', '/arena/' || d.id, jsonb_build_object('duel_id', d.id));
  end if;

  return jsonb_build_object(
    'duel_id', d.id, 'status', d.status, 'winner_id', d.winner_id, 'score', v_score, 'ms', v_ms,
    'total', cardinality(d.question_ids), 'attempt_id', v_res->>'attempt_id', 'answers', v_graded,
    'achievements', coalesce(v_res->'achievements', '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- client RPCs: friends

-- Sends a request; if they already asked you, this accepts theirs instead. Returns the resulting status.
create or replace function public.fbla_friend_request(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_user is null or not exists (select 1 from public.fbla_profiles where id = p_user) then
    raise exception 'that player does not exist' using errcode = '22023';
  end if;
  if p_user = v_uid then raise exception 'you cannot add yourself' using errcode = '22023'; end if;
  if exists (select 1 from public.fbla_friends where status = 'accepted'
             and ((user_id = v_uid and friend_id = p_user) or (user_id = p_user and friend_id = v_uid))) then
    return 'accepted';
  end if;
  v_name := fbla_private.fbla_player_name(v_uid);
  if exists (select 1 from public.fbla_friends where user_id = p_user and friend_id = v_uid and status = 'pending') then
    update public.fbla_friends set status = 'accepted' where user_id = p_user and friend_id = v_uid;
    perform public.fbla_notify(p_user, 'friend_accepted', v_name || ' accepted your friend request',
      'Challenge them in the Arena.', '/arena?tab=friends', jsonb_build_object('user_id', v_uid));
    return 'accepted';
  end if;
  if exists (select 1 from public.fbla_friends where user_id = v_uid and friend_id = p_user) then
    return 'pending';
  end if;
  if (select count(*) from public.fbla_friends where user_id = v_uid and status = 'pending') >= 50 then
    raise exception 'you have 50 requests waiting; give them time' using errcode = '22023';
  end if;
  insert into public.fbla_friends (user_id, friend_id, status) values (v_uid, p_user, 'pending');
  perform public.fbla_notify(p_user, 'friend_request', v_name || ' sent you a friend request', null,
    '/arena?tab=friends', jsonb_build_object('user_id', v_uid));
  return 'pending';
end $$;

create or replace function public.fbla_friend_respond(p_user uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_friends where user_id = p_user and friend_id = v_uid and status = 'pending') then
    raise exception 'friend request not found' using errcode = '22023';
  end if;
  if coalesce(p_accept, false) then
    update public.fbla_friends set status = 'accepted' where user_id = p_user and friend_id = v_uid;
    perform public.fbla_notify(p_user, 'friend_accepted',
      fbla_private.fbla_player_name(v_uid) || ' accepted your friend request',
      'Challenge them in the Arena.', '/arena?tab=friends', jsonb_build_object('user_id', v_uid));
    return 'accepted';
  end if;
  delete from public.fbla_friends where user_id = p_user and friend_id = v_uid;
  return 'declined';
end $$;

-- Removes a friend, cancels your outgoing request, or ignores an incoming one.
create or replace function public.fbla_friend_remove(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.fbla_friends
    where (user_id = v_uid and friend_id = p_user) or (user_id = p_user and friend_id = v_uid);
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'fbla_arena_sweep()', 'fbla_challenge(uuid, text, integer, text)', 'fbla_respond_duel(uuid, boolean)',
    'fbla_cancel_duel(uuid)', 'fbla_start_duel(uuid)', 'fbla_submit_duel(uuid, jsonb)',
    'fbla_friend_request(uuid)', 'fbla_friend_respond(uuid, boolean)', 'fbla_friend_remove(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
