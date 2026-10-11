-- 0015 Duel privacy.
--
-- Before: both players could read fbla_duels.question_ids while a challenge was still pending (so the questions
-- could be studied before the clock started), and the second player could read the first player's score and time
-- before playing (fbla_duels is also in supabase_realtime).
-- Now:
--   * question_ids and the four score/time columns lose their client grants. Realtime payloads only carry the
--     columns a client may select, so they no longer leak either.
--   * challenger_done / opponent_done say whether a side has played (kept in sync by a trigger).
--   * fbla_my_duels returns duels in the old row shape with the hidden parts masked: question_ids only once the
--     caller has started their run (fbla_start_duel) or the duel is over, the other side's score/time only once the
--     duel is complete. fbla_start_duel returns the questions (text and choices, never keys).
--   * fbla_respond_duel / fbla_cancel_duel return the masked row instead of the raw table row.

alter table public.fbla_duels
  add column if not exists challenger_done boolean not null default false,
  add column if not exists opponent_done boolean not null default false;
update public.fbla_duels
  set challenger_done = challenger_score is not null, opponent_done = opponent_score is not null
  where challenger_done is distinct from (challenger_score is not null)
     or opponent_done is distinct from (opponent_score is not null);

create or replace function public.fbla_duels_done_flags()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.challenger_done := new.challenger_score is not null;
  new.opponent_done := new.opponent_score is not null;
  return new;
end $$;
revoke all on function public.fbla_duels_done_flags() from public, anon, authenticated;
drop trigger if exists fbla_duels_done_flags on public.fbla_duels;
create trigger fbla_duels_done_flags before insert or update on public.fbla_duels
  for each row execute function public.fbla_duels_done_flags();

revoke select on public.fbla_duels from authenticated;
revoke select (question_ids, challenger_score, challenger_ms, opponent_score, opponent_ms)
  on public.fbla_duels from authenticated;
grant select (id, challenger_id, opponent_id, event, status, winner_id, created_at, accepted_at, completed_at,
              expires_at, time_limit_sec, message, forfeit_by, challenger_done, opponent_done)
  on public.fbla_duels to authenticated;

-- ---------------------------------------------------------------- masked view of one duel for one player
create or replace function fbla_private.fbla_duel_view(d public.fbla_duels, p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(d)
    || jsonb_build_object(
         'question_ids', case when d.status = 'complete'
                                or exists (select 1 from public.fbla_duel_runs r where r.duel_id = d.id and r.user_id = p_uid)
                              then to_jsonb(d.question_ids) else '[]'::jsonb end,
         'challenger_score', case when d.status = 'complete' or p_uid = d.challenger_id then d.challenger_score end,
         'challenger_ms', case when d.status = 'complete' or p_uid = d.challenger_id then d.challenger_ms end,
         'opponent_score', case when d.status = 'complete' or p_uid = d.opponent_id then d.opponent_score end,
         'opponent_ms', case when d.status = 'complete' or p_uid = d.opponent_id then d.opponent_ms end)
$$;
revoke all on function fbla_private.fbla_duel_view(public.fbla_duels, uuid) from public, anon, authenticated;

-- The caller's duels (newest first), one duel (p_id), or only open ones (p_open: pending/accepted, not expired).
create or replace function public.fbla_my_duels(p_id uuid default null, p_limit integer default 150,
                                                p_open boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(fbla_private.fbla_duel_view(d, v_uid) order by d.created_at desc)
    from (
      select * from public.fbla_duels x
      where v_uid in (x.challenger_id, x.opponent_id)
        and (p_id is null or x.id = p_id)
        and (not coalesce(p_open, false) or (x.status in ('pending', 'accepted') and x.expires_at > now()))
      order by x.created_at desc
      limit least(greatest(coalesce(p_limit, 150), 1), 500)
    ) d), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- start: now hands out the questions
create or replace function public.fbla_start_duel(p_duel uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
  r public.fbla_duel_runs;
  v_questions jsonb;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform fbla_private.fbla_duel_sweep();
  select * into d from public.fbla_duels where id = p_duel;
  if not found or v_uid not in (d.challenger_id, d.opponent_id) then
    raise exception 'duel not found' using errcode = '42501';
  end if;
  select * into r from public.fbla_duel_runs where duel_id = p_duel and user_id = v_uid;
  if not (found and r.finished_at is not null) then
    if d.status <> 'accepted' then raise exception 'this duel is not open for play' using errcode = '22023'; end if;
    -- two tabs (or a double effect) may start at once: the first insert wins, everyone reads it back
    insert into public.fbla_duel_runs (duel_id, user_id) values (p_duel, v_uid) on conflict (duel_id, user_id) do nothing;
    select * into r from public.fbla_duel_runs where duel_id = p_duel and user_id = v_uid;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'event', q.event, 'sub', q.sub, 'diff', q.diff,
                                               'q', q.q, 'choices', q.choices) order by x.ord), '[]'::jsonb)
    into v_questions
  from unnest(d.question_ids) with ordinality x(id, ord)
  join public.fbla_questions q on q.id = x.id;

  return jsonb_build_object('started_at', r.started_at, 'finished', r.finished_at is not null, 'server_now', now(),
    'deadline', r.started_at + make_interval(secs => d.time_limit_sec),
    'question_ids', to_jsonb(d.question_ids), 'questions', v_questions);
end $$;

-- ---------------------------------------------------------------- respond / cancel: masked rows
drop function if exists public.fbla_respond_duel(uuid, boolean);
create function public.fbla_respond_duel(p_duel uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  return fbla_private.fbla_duel_view(d, v_uid);
end $$;

drop function if exists public.fbla_cancel_duel(uuid);
create function public.fbla_cancel_duel(p_duel uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d public.fbla_duels;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into d from public.fbla_duels where id = p_duel for update;
  if not found or d.challenger_id <> v_uid then raise exception 'challenge not found' using errcode = '42501'; end if;
  if d.status <> 'pending' then raise exception 'only a challenge that has not been answered can be cancelled' using errcode = '22023'; end if;
  update public.fbla_duels set status = 'cancelled', completed_at = now() where id = p_duel returning * into d;
  return fbla_private.fbla_duel_view(d, v_uid);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'fbla_my_duels(uuid, integer, boolean)', 'fbla_start_duel(uuid)', 'fbla_respond_duel(uuid, boolean)',
    'fbla_cancel_duel(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
