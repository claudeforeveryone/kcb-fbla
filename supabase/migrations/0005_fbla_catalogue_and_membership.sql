-- 1. Question catalogue: an answer must name a real question, and its event, area and difficulty come from the
--    catalogue, not the browser. So the most a member can ever claim is every question right once, the same
--    as a perfect honest run. (Whether an answer was right is still reported by the browser; the answer keys
--    ship to the browser anyway, so checking them server-side would add nothing.) Seed: supabase/seed/.
-- 2. First attempts for the rating come from the log order (row_number), not the stored flag.
-- 3. Orbit shares this auth; only chapter members (people with an fbla_profiles row) can read chapter data.

create table if not exists public.fbla_questions (
  qid text primary key,
  topic text not null,
  sub text not null,
  diff smallint not null check (diff between 1 and 3)
);
alter table public.fbla_questions enable row level security;
create policy fbla_questions_read on public.fbla_questions for select to authenticated using (true);

create or replace function public.fbla_answer_defaults()
returns trigger language plpgsql set search_path = '' as $$
declare q public.fbla_questions;
begin
  select * into q from public.fbla_questions where qid = new.qid;
  if not found then raise exception 'unknown question %', new.qid; end if;
  new.topic := q.topic;
  new.sub := q.sub;
  new.diff := q.diff;
  new.at := least(coalesce(new.at, now()), now());
  new.first := not exists (
    select 1 from public.fbla_answers a where a.user_id = new.user_id and a.qid = new.qid
  );
  return new;
end $$;

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
    select diff, correct from (
      select diff, correct, at, id, row_number() over (partition by qid order by at, id) as rn
      from public.fbla_answers where user_id = uid
    ) x where rn = 1 order by at, id
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

create or replace function public.fbla_is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fbla_profiles where id = (select auth.uid()))
$$;
revoke all on function public.fbla_is_member() from public, anon;
grant execute on function public.fbla_is_member() to authenticated;

-- restrictive: on top of the existing read policies
create policy fbla_profiles_members on public.fbla_profiles as restrictive for select to authenticated
  using (id = (select auth.uid()) or (select public.fbla_is_member()));
create policy fbla_answers_members on public.fbla_answers as restrictive for select to authenticated
  using ((select public.fbla_is_member()));
create policy fbla_reviews_members on public.fbla_reviews as restrictive for select to authenticated
  using ((select public.fbla_is_member()));
create policy fbla_papers_members on public.fbla_papers as restrictive for select to authenticated
  using ((select public.fbla_is_member()));
create policy fbla_duels_members on public.fbla_duels as restrictive for select to authenticated
  using ((select public.fbla_is_member()));
