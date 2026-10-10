-- KCB FBLA, on the shared "orbit" project. Everything is prefixed fbla_ so it never collides with orbit's own tables.
-- The site keeps event logs (answers, vocab reviews, papers, duels) and computes rating, mastery and readiness
-- from them in the browser; the profile row caches rating and peak for the leaderboard.

create table if not exists public.fbla_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  grade int check (grade between 9 and 12),
  rival uuid references public.fbla_profiles (id) on delete set null,
  event text,
  level text not null default 'District',
  comp_dates jsonb not null default '{}'::jsonb,
  rating real not null default 0,
  peak real not null default 0,
  answered int not null default 0,
  correct int not null default 0,
  mastered int not null default 0,
  resume jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fbla_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade default auth.uid(),
  qid text not null,
  topic text not null,
  sub text not null,
  diff smallint not null check (diff between 1 and 3),
  correct boolean not null,
  first boolean not null,
  ms int not null check (ms >= 0),
  mode text not null,
  at timestamptz not null default now()
);
create index if not exists fbla_answers_user_at on public.fbla_answers (user_id, at);

create table if not exists public.fbla_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade default auth.uid(),
  term text not null,
  correct boolean not null,
  ms int not null check (ms >= 0),
  at timestamptz not null default now()
);
create index if not exists fbla_reviews_user_at on public.fbla_reviews (user_id, at);

create table if not exists public.fbla_papers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade default auth.uid(),
  kind text not null,
  topic text,
  label text not null,
  total int not null check (total > 0),
  correct int not null check (correct >= 0),
  ms int not null check (ms >= 0),
  at timestamptz not null default now()
);
create index if not exists fbla_papers_user on public.fbla_papers (user_id, at);

create table if not exists public.fbla_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fbla_profiles (id) on delete cascade default auth.uid(),
  term text not null check (char_length(term) between 1 and 120),
  def text not null check (char_length(def) between 1 and 600),
  ref text,
  at timestamptz not null default now()
);
create index if not exists fbla_words_user on public.fbla_words (user_id);

create table if not exists public.fbla_duels (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  seed text not null,
  size int not null default 10,
  challenger uuid not null references public.fbla_profiles (id) on delete cascade default auth.uid(),
  opponent uuid not null references public.fbla_profiles (id) on delete cascade,
  c_score int, c_ms int,
  o_score int, o_ms int,
  at timestamptz not null default now(),
  check (challenger <> opponent)
);
create index if not exists fbla_duels_challenger on public.fbla_duels (challenger);
create index if not exists fbla_duels_opponent on public.fbla_duels (opponent);

alter table public.fbla_profiles enable row level security;
alter table public.fbla_answers enable row level security;
alter table public.fbla_reviews enable row level security;
alter table public.fbla_papers enable row level security;
alter table public.fbla_words enable row level security;
alter table public.fbla_duels enable row level security;

-- Chapter members see each other's study records (leaderboard, team profiles, compare); everyone writes only their own.
create policy fbla_profiles_read on public.fbla_profiles for select to authenticated using (true);
create policy fbla_profiles_insert on public.fbla_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy fbla_profiles_update on public.fbla_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy fbla_answers_read on public.fbla_answers for select to authenticated using (true);
create policy fbla_answers_insert on public.fbla_answers for insert to authenticated with check (user_id = (select auth.uid()));

create policy fbla_reviews_read on public.fbla_reviews for select to authenticated using (true);
create policy fbla_reviews_insert on public.fbla_reviews for insert to authenticated with check (user_id = (select auth.uid()));

create policy fbla_papers_read on public.fbla_papers for select to authenticated using (true);
create policy fbla_papers_insert on public.fbla_papers for insert to authenticated with check (user_id = (select auth.uid()));

create policy fbla_words_read on public.fbla_words for select to authenticated using (user_id = (select auth.uid()));
create policy fbla_words_insert on public.fbla_words for insert to authenticated with check (user_id = (select auth.uid()));
create policy fbla_words_delete on public.fbla_words for delete to authenticated using (user_id = (select auth.uid()));

create policy fbla_duels_read on public.fbla_duels for select to authenticated using (true);
create policy fbla_duels_insert on public.fbla_duels for insert to authenticated
  with check (challenger = (select auth.uid()) and c_score is null and o_score is null);

-- Each player posts only their own side of a duel, once.
create or replace function public.fbla_post_duel(duel uuid, score int, ms int)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.fbla_duels;
begin
  select * into d from public.fbla_duels where id = duel for update;
  if not found then raise exception 'no such duel'; end if;
  if score < 0 or score > d.size or ms < 0 then raise exception 'bad score'; end if;
  if d.challenger = auth.uid() and d.c_score is null then
    update public.fbla_duels set c_score = score, c_ms = ms where id = duel;
  elsif d.opponent = auth.uid() and d.o_score is null then
    update public.fbla_duels set o_score = score, o_ms = ms where id = duel;
  else
    raise exception 'not your duel, or already played';
  end if;
end $$;
revoke all on function public.fbla_post_duel(uuid, int, int) from public, anon;
grant execute on function public.fbla_post_duel(uuid, int, int) to authenticated;
