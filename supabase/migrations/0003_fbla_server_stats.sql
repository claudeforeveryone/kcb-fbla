-- Applied to orbit as fbla_0003a_server_stats_functions + fbla_0003b_profile_column_grants.
-- Leaderboard numbers are computed by the database, not reported by the browser.
-- 1. Members may only edit their own profile's settings columns; rating/peak/answered/correct/mastered are
--    written by fbla_sync_stats(), which replays the member's answers with the same Elo rule as src/lib/score.ts.
-- 2. "first" on an answer is decided by the database (no earlier answer to that question), and answers can't be
--    dated in the future.
-- 3. Duels can't be created with a time already filled in.

revoke update on public.fbla_profiles from authenticated, anon;
grant update (name, grade, rival, event, level, comp_dates, resume, updated_at) on public.fbla_profiles to authenticated;

create or replace function public.fbla_answer_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.at := least(coalesce(new.at, now()), now());
  new.first := not exists (
    select 1 from public.fbla_answers a where a.user_id = new.user_id and a.qid = new.qid
  );
  return new;
end $$;

create trigger fbla_answer_defaults before insert on public.fbla_answers
  for each row execute function public.fbla_answer_defaults();

create or replace function public.fbla_sync_stats()
returns public.fbla_profiles language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r double precision := 0;
  pk double precision := 0;
  q double precision;
  e double precision;
  row record;
  n_answered int;
  n_correct int;
  n_mastered int;
  out public.fbla_profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  for row in
    select diff, correct from public.fbla_answers where user_id = uid and first order by at, id
  loop
    q := case row.diff when 1 then -200 when 2 then 0 else 200 end;
    e := 1 / (1 + power(10, (q - r) / 400.0));
    r := greatest(0, r + 32 * ((case when row.correct then 1 else 0 end) - e));
    pk := greatest(pk, r);
  end loop;
  select count(*), count(*) filter (where correct) into n_answered, n_correct
    from public.fbla_answers where user_id = uid;
  select count(distinct qid) into n_mastered from (
    select qid, correct,
      row_number() over (partition by qid order by at, id) as rn,
      lag(correct) over (partition by qid order by at, id) as prev
    from public.fbla_answers where user_id = uid
  ) x where (rn = 1 and correct) or (correct and prev);
  update public.fbla_profiles
    set rating = round(r::numeric, 1), peak = round(pk::numeric, 1), answered = n_answered,
        correct = n_correct, mastered = n_mastered, updated_at = now()
    where id = uid
    returning * into out;
  return out;
end $$;
revoke all on function public.fbla_sync_stats() from public, anon;
grant execute on function public.fbla_sync_stats() to authenticated;

-- restrictive: on top of fbla_duels_insert, no times may be filled in at creation
create policy fbla_duels_insert_no_times on public.fbla_duels as restrictive for insert to authenticated
  with check (c_ms is null and o_ms is null);
