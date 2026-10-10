-- 0006 core schema (2026-10 rebuild). See docs/SPEC.md "Data model".
-- Drops the old empty fbla_* tables, reshapes fbla_questions (keeps its 1,500 rows) and creates every core and
-- feature table with indexes, helper functions, baseline RLS, the avatars bucket and realtime.

-- ---------------------------------------------------------------- old objects (all empty)
drop function if exists public.fbla_post_duel(uuid, integer, integer);
drop function if exists public.fbla_sync_stats();
drop table if exists public.fbla_answers, public.fbla_duels, public.fbla_papers, public.fbla_reviews,
  public.fbla_words, public.fbla_profiles cascade;
drop function if exists public.fbla_answer_defaults();
drop function if exists public.fbla_is_member();

-- ---------------------------------------------------------------- questions: keep rows, add grading data
alter table public.fbla_questions rename column qid to id;
alter table public.fbla_questions rename column topic to event;
alter table public.fbla_questions
  add column if not exists q text,
  add column if not exists choices jsonb,
  add column if not exists answer smallint check (answer between 0 and 3),
  add column if not exists explain text;
create index if not exists fbla_questions_event_idx on public.fbla_questions (event, sub);
drop policy if exists fbla_questions_read on public.fbla_questions;
create policy fbla_questions_read on public.fbla_questions for select to authenticated using (true);
revoke insert, update, delete on public.fbla_questions from anon, authenticated;

-- ---------------------------------------------------------------- types
do $$ begin
  create type public.fbla_role as enum ('president', 'executive', 'trainer', 'member');
exception when duplicate_object then null; end $$;

-- local calendar day for streaks (the chapter is in Ontario)
create or replace function public.fbla_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Toronto')::date
$$;

create or replace function public.fbla_is_event(p text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.fbla_questions where event = p)
$$;

-- ---------------------------------------------------------------- chapters and profiles
create table public.fbla_chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  school text check (char_length(school) <= 120),
  region text check (char_length(region) <= 80),
  description text check (char_length(description) <= 1000),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  invite_token text not null unique,
  president_id uuid,
  created_at timestamptz not null default now()
);

create table public.fbla_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text check (char_length(avatar_url) <= 500),
  school text check (char_length(school) <= 120),
  grade smallint check (grade between 7 and 12),
  main_event text,
  bio text check (char_length(bio) <= 280),
  chapter_id uuid references public.fbla_chapters (id) on delete set null,
  elo integer not null default 0 check (elo >= 0),
  peak_elo integer not null default 0,
  questions_answered integer not null default 0,
  questions_correct integer not null default 0,
  time_spent_ms bigint not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  answer_streak integer not null default 0,
  best_answer_streak integer not null default 0,
  last_active_date date,
  duel_wins integer not null default 0,
  duel_losses integer not null default 0,
  duel_draws integer not null default 0,
  email_opt_in boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index fbla_profiles_elo_idx on public.fbla_profiles (elo desc, questions_answered desc);
create index fbla_profiles_chapter_idx on public.fbla_profiles (chapter_id);

alter table public.fbla_chapters
  add constraint fbla_chapters_president_fk foreign key (president_id)
  references public.fbla_profiles (id) on delete set null;
create index fbla_chapters_president_idx on public.fbla_chapters (president_id);

create table public.fbla_chapter_members (
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  user_id uuid not null unique references public.fbla_profiles (id) on delete cascade,
  role public.fbla_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);
create index fbla_chapter_members_role_idx on public.fbla_chapter_members (chapter_id, role);

create table public.fbla_chapter_bans (
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  banned_by uuid references public.fbla_profiles (id) on delete set null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);
create index fbla_chapter_bans_user_idx on public.fbla_chapter_bans (user_id);
create index fbla_chapter_bans_by_idx on public.fbla_chapter_bans (banned_by);

create table public.fbla_trainers (
  chapter_id uuid not null,
  user_id uuid not null,
  event text not null,
  created_at timestamptz not null default now(),
  primary key (chapter_id, event, user_id),
  foreign key (chapter_id, user_id) references public.fbla_chapter_members (chapter_id, user_id) on delete cascade
);
create index fbla_trainers_user_idx on public.fbla_trainers (chapter_id, user_id);

-- ---------------------------------------------------------------- feature tables (referenced by attempts)
create table public.fbla_custom_tests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  author_id uuid references public.fbla_profiles (id) on delete set null,
  event text,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  time_limit_sec integer check (time_limit_sec is null or time_limit_sec between 30 and 14400),
  shuffle boolean not null default true,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  source text not null default 'custom' check (source in ('custom', 'copied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fbla_custom_tests_chapter_idx on public.fbla_custom_tests (chapter_id, created_at desc);
create index fbla_custom_tests_author_idx on public.fbla_custom_tests (author_id);

create table public.fbla_decks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  author_id uuid references public.fbla_profiles (id) on delete set null,
  event text,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  created_at timestamptz not null default now()
);
create index fbla_decks_chapter_idx on public.fbla_decks (chapter_id, created_at desc);
create index fbla_decks_author_idx on public.fbla_decks (author_id);

create table public.fbla_assignments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  kind text not null check (kind in ('test', 'deck', 'official')),
  ref text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  instructions text check (char_length(instructions) <= 2000),
  due_at timestamptz,
  assigned_by uuid references public.fbla_profiles (id) on delete set null,
  event text,
  created_at timestamptz not null default now()
);
create index fbla_assignments_chapter_idx on public.fbla_assignments (chapter_id, due_at);
create index fbla_assignments_by_idx on public.fbla_assignments (assigned_by);

create table public.fbla_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.fbla_profiles (id) on delete cascade,
  opponent_id uuid not null references public.fbla_profiles (id) on delete cascade,
  event text not null,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 50),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'complete')),
  challenger_score integer,
  challenger_ms integer,
  opponent_score integer,
  opponent_ms integer,
  winner_id uuid references public.fbla_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  check (challenger_id <> opponent_id)
);
create index fbla_duels_challenger_idx on public.fbla_duels (challenger_id, created_at desc);
create index fbla_duels_opponent_idx on public.fbla_duels (opponent_id, created_at desc);
create index fbla_duels_winner_idx on public.fbla_duels (winner_id);
create index fbla_duels_open_idx on public.fbla_duels (status, expires_at) where status in ('pending', 'accepted');

-- ---------------------------------------------------------------- attempts and answers
create table public.fbla_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  kind text not null check (kind in
    ('practice', 'daily', 'endless', 'weak', 'mock', 'area', 'custom', 'assignment', 'duel', 'redo')),
  event text,
  label text check (char_length(label) <= 160),
  total integer not null default 0,
  correct integer not null default 0,
  duration_ms bigint not null default 0,
  elo_before integer not null default 0,
  elo_after integer not null default 0,
  custom_test_id uuid references public.fbla_custom_tests (id) on delete set null,
  assignment_id uuid references public.fbla_assignments (id) on delete set null,
  duel_id uuid references public.fbla_duels (id) on delete set null,
  created_at timestamptz not null default now()
);
create index fbla_attempts_user_idx on public.fbla_attempts (user_id, created_at desc);
create index fbla_attempts_user_event_idx on public.fbla_attempts (user_id, event, created_at desc);
create index fbla_attempts_assignment_idx on public.fbla_attempts (assignment_id, user_id);
create index fbla_attempts_custom_idx on public.fbla_attempts (custom_test_id);
create index fbla_attempts_duel_idx on public.fbla_attempts (duel_id);

create table public.fbla_answers (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.fbla_attempts (id) on delete cascade,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  question_id text not null,
  event text,
  sub text,
  diff smallint check (diff between 1 and 3),
  chosen smallint,
  correct boolean not null,
  ms integer not null default 0,
  elo_delta integer not null default 0,
  created_at timestamptz not null default now()
);
create index fbla_answers_attempt_idx on public.fbla_answers (attempt_id, id);
create index fbla_answers_user_q_idx on public.fbla_answers (user_id, question_id);
create index fbla_answers_user_event_idx on public.fbla_answers (user_id, event, sub);
create index fbla_answers_event_idx on public.fbla_answers (event, user_id);

-- ---------------------------------------------------------------- vocab, notifications, achievements
create table public.fbla_vocab_progress (
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  term_id text not null,
  box smallint not null default 0 check (box between 0 and 5),
  due_at timestamptz not null default now(),
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  last_reviewed_at timestamptz,
  primary key (user_id, term_id)
);
create index fbla_vocab_progress_due_idx on public.fbla_vocab_progress (user_id, due_at);

create table public.fbla_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index fbla_notifications_user_idx on public.fbla_notifications (user_id, created_at desc);
create index fbla_notifications_unread_idx on public.fbla_notifications (user_id) where read_at is null;

create table public.fbla_achievement_defs (
  code text primary key,
  title text not null,
  description text not null,
  icon text not null,
  sort smallint not null default 0
);

create table public.fbla_achievements (
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  code text not null references public.fbla_achievement_defs (code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);
create index fbla_achievements_code_idx on public.fbla_achievements (code);

-- ---------------------------------------------------------------- remaining feature tables
create table public.fbla_friends (
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  friend_id uuid not null references public.fbla_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index fbla_friends_friend_idx on public.fbla_friends (friend_id);

create table public.fbla_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  held_on date not null default (now() at time zone 'America/Toronto')::date,
  created_by uuid references public.fbla_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index fbla_attendance_sessions_chapter_idx on public.fbla_attendance_sessions (chapter_id, held_on desc);
create index fbla_attendance_sessions_by_idx on public.fbla_attendance_sessions (created_by);

create table public.fbla_attendance (
  session_id uuid not null references public.fbla_attendance_sessions (id) on delete cascade,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  primary key (session_id, user_id)
);
create index fbla_attendance_user_idx on public.fbla_attendance (user_id);

create table public.fbla_posts (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.fbla_chapters (id) on delete cascade,
  author_id uuid references public.fbla_profiles (id) on delete set null,
  kind text not null default 'announcement' check (kind in ('announcement', 'link', 'newsletter', 'resource')),
  event text,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (char_length(body) <= 20000),
  url text check (char_length(url) <= 1000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index fbla_posts_chapter_idx on public.fbla_posts (chapter_id, pinned desc, created_at desc);
create index fbla_posts_author_idx on public.fbla_posts (author_id);

-- ---------------------------------------------------------------- helper functions (used by RLS)
create or replace function public.fbla_my_chapter()
returns uuid language sql stable security definer set search_path = '' as $$
  select chapter_id from public.fbla_chapter_members where user_id = (select auth.uid())
$$;

create or replace function public.fbla_my_role()
returns public.fbla_role language sql stable security definer set search_path = '' as $$
  select role from public.fbla_chapter_members where user_id = (select auth.uid())
$$;

-- president or executive of that chapter
create or replace function public.fbla_is_chapter_admin(p_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fbla_chapter_members
    where chapter_id = p_chapter and user_id = (select auth.uid()) and role in ('president', 'executive')
  )
$$;

-- admin, or a trainer of that chapter (for p_event, or for any event when p_event is null)
create or replace function public.fbla_is_chapter_staff(p_chapter uuid, p_event text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fbla_is_chapter_admin(p_chapter) or exists (
    select 1 from public.fbla_trainers t
    where t.chapter_id = p_chapter and t.user_id = (select auth.uid())
      and (p_event is null or t.event = p_event)
  )
$$;

-- self, or staff of the chapter the member belongs to
create or replace function public.fbla_can_view_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) or exists (
    select 1 from public.fbla_chapter_members m
    where m.user_id = p_user and public.fbla_is_chapter_staff(m.chapter_id)
  )
$$;

-- is the caller a member of that chapter
create or replace function public.fbla_in_chapter(p_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fbla_chapter_members where chapter_id = p_chapter and user_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------- notifications helper (server only)
create or replace function public.fbla_notify(
  p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null,
  p_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user is null then return null; end if;
  insert into public.fbla_notifications (user_id, kind, title, body, link, data)
  values (p_user, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- triggers: profiles
-- direct client updates may only change cosmetic columns (column grants enforce it too); username is normalised
create or replace function public.fbla_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.username := lower(btrim(new.username));
  new.display_name := btrim(new.display_name);
  if new.main_event is not null and not public.fbla_is_event(new.main_event) then
    raise exception 'unknown event %', new.main_event using errcode = '22023';
  end if;
  return new;
end $$;
create trigger fbla_profiles_guard before insert or update on public.fbla_profiles
  for each row execute function public.fbla_profiles_guard();

-- ---------------------------------------------------------------- triggers: chapters and membership
create or replace function public.fbla_new_join_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') into code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.fbla_chapters where join_code = code);
  end loop;
  return code;
end $$;

create or replace function public.fbla_new_invite_token()
returns text language sql volatile set search_path = '' as $$
  select replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', '_'), '+', '-')
$$;

create or replace function public.fbla_chapters_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.join_code := public.fbla_new_join_code();
  new.invite_token := public.fbla_new_invite_token();
  new.name := btrim(new.name);
  if current_user = 'authenticated' then
    new.president_id := (select auth.uid());
    if new.president_id is null then raise exception 'not signed in'; end if;
    if not exists (select 1 from public.fbla_profiles where id = new.president_id) then
      raise exception 'create your profile first' using errcode = '42501';
    end if;
    if exists (select 1 from public.fbla_chapter_members where user_id = new.president_id) then
      raise exception 'you are already in a chapter' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger fbla_chapters_before_insert before insert on public.fbla_chapters
  for each row execute function public.fbla_chapters_before_insert();

-- the creator becomes president
create or replace function public.fbla_chapters_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.president_id is not null then
    insert into public.fbla_chapter_members (chapter_id, user_id, role)
    values (new.id, new.president_id, 'president')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
create trigger fbla_chapters_after_insert after insert on public.fbla_chapters
  for each row execute function public.fbla_chapters_after_insert();

-- checks on direct (client) membership writes; security-definer RPCs run as the owner and skip them
create or replace function public.fbla_members_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me_role public.fbla_role;
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select role into me_role from public.fbla_chapter_members
    where user_id = (select auth.uid()) and chapter_id = coalesce(new.chapter_id, old.chapter_id);
  if tg_op = 'INSERT' then
    if new.role = 'president' then raise exception 'use the transfer flow' using errcode = '42501'; end if;
    if new.role = 'executive' and me_role is distinct from 'president' then
      raise exception 'only the president can add executives' using errcode = '42501';
    end if;
    if exists (select 1 from public.fbla_chapter_bans where chapter_id = new.chapter_id and user_id = new.user_id) then
      raise exception 'that member is banned from this chapter' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.chapter_id <> old.chapter_id or new.user_id <> old.user_id then
      raise exception 'cannot move memberships' using errcode = '42501';
    end if;
    if old.role = 'president' or new.role = 'president' then
      raise exception 'use the transfer flow' using errcode = '42501';
    end if;
    if (old.role = 'executive' or new.role = 'executive') and me_role is distinct from 'president' then
      raise exception 'only the president can change executives' using errcode = '42501';
    end if;
    return new;
  else
    -- cascades from deleting the chapter itself
    if not exists (select 1 from public.fbla_chapters where id = old.chapter_id) then return old; end if;
    if old.role = 'president' then
      raise exception 'the president must transfer the chapter first' using errcode = '42501';
    end if;
    if old.role = 'executive' and old.user_id <> (select auth.uid()) and me_role is distinct from 'president' then
      raise exception 'only the president can remove executives' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
create trigger fbla_members_guard before insert or update or delete on public.fbla_chapter_members
  for each row execute function public.fbla_members_guard();

-- fbla_profiles.chapter_id mirrors membership
create or replace function public.fbla_members_mirror()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.fbla_profiles set chapter_id = null where id = old.user_id and chapter_id = old.chapter_id;
    delete from public.fbla_trainers where chapter_id = old.chapter_id and user_id = old.user_id;
    return old;
  end if;
  update public.fbla_profiles set chapter_id = new.chapter_id where id = new.user_id;
  if tg_op = 'INSERT' then
    perform public.fbla_award_achievement(new.user_id, 'chapter_joined');
  end if;
  return new;
end $$;
create trigger fbla_members_mirror after insert or update or delete on public.fbla_chapter_members
  for each row execute function public.fbla_members_mirror();

-- a ban removes the membership
create or replace function public.fbla_bans_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fbla_chapter_members
             where chapter_id = new.chapter_id and user_id = new.user_id and role = 'president') then
    raise exception 'cannot ban the president' using errcode = '42501';
  end if;
  delete from public.fbla_chapter_members where chapter_id = new.chapter_id and user_id = new.user_id;
  return new;
end $$;
create trigger fbla_bans_after_insert after insert on public.fbla_chapter_bans
  for each row execute function public.fbla_bans_after_insert();

create or replace function public.fbla_bans_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user = 'authenticated' then new.banned_by := (select auth.uid()); end if;
  return new;
end $$;
create trigger fbla_bans_before_insert before insert on public.fbla_chapter_bans
  for each row execute function public.fbla_bans_before_insert();

-- trainers: valid event, at most 2 per event, member role follows
create or replace function public.fbla_trainers_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.fbla_is_event(new.event) then raise exception 'unknown event %', new.event using errcode = '22023'; end if;
  perform 1 from public.fbla_chapters where id = new.chapter_id for update;
  if (select count(*) from public.fbla_trainers where chapter_id = new.chapter_id and event = new.event) >= 2 then
    raise exception 'an event can have at most 2 trainers' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger fbla_trainers_guard before insert on public.fbla_trainers
  for each row execute function public.fbla_trainers_guard();

create or replace function public.fbla_trainers_sync_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.fbla_chapter_members set role = 'trainer'
      where chapter_id = new.chapter_id and user_id = new.user_id and role = 'member';
    return new;
  end if;
  if not exists (select 1 from public.fbla_trainers where chapter_id = old.chapter_id and user_id = old.user_id) then
    update public.fbla_chapter_members set role = 'member'
      where chapter_id = old.chapter_id and user_id = old.user_id and role = 'trainer';
  end if;
  return old;
end $$;
create trigger fbla_trainers_sync_role after insert or delete on public.fbla_trainers
  for each row execute function public.fbla_trainers_sync_role();

create or replace function public.fbla_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger fbla_custom_tests_touch before update on public.fbla_custom_tests
  for each row execute function public.fbla_touch_updated_at();

-- authors are always the caller on direct inserts
create or replace function public.fbla_set_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    case tg_table_name
      when 'fbla_assignments' then new.assigned_by := (select auth.uid());
      when 'fbla_attendance_sessions' then new.created_by := (select auth.uid());
      else new.author_id := (select auth.uid());
    end case;
  end if;
  return new;
end $$;
create trigger fbla_posts_author before insert on public.fbla_posts for each row execute function public.fbla_set_author();
create trigger fbla_tests_author before insert on public.fbla_custom_tests for each row execute function public.fbla_set_author();
create trigger fbla_decks_author before insert on public.fbla_decks for each row execute function public.fbla_set_author();
create trigger fbla_assignments_author before insert on public.fbla_assignments for each row execute function public.fbla_set_author();
create trigger fbla_sessions_author before insert on public.fbla_attendance_sessions for each row execute function public.fbla_set_author();

-- ---------------------------------------------------------------- RLS
alter table public.fbla_profiles enable row level security;
alter table public.fbla_chapters enable row level security;
alter table public.fbla_chapter_members enable row level security;
alter table public.fbla_chapter_bans enable row level security;
alter table public.fbla_trainers enable row level security;
alter table public.fbla_attempts enable row level security;
alter table public.fbla_answers enable row level security;
alter table public.fbla_vocab_progress enable row level security;
alter table public.fbla_notifications enable row level security;
alter table public.fbla_achievement_defs enable row level security;
alter table public.fbla_achievements enable row level security;
alter table public.fbla_duels enable row level security;
alter table public.fbla_friends enable row level security;
alter table public.fbla_attendance_sessions enable row level security;
alter table public.fbla_attendance enable row level security;
alter table public.fbla_posts enable row level security;
alter table public.fbla_custom_tests enable row level security;
alter table public.fbla_decks enable row level security;
alter table public.fbla_assignments enable row level security;

-- nothing here is for signed-out visitors
revoke all on public.fbla_profiles, public.fbla_chapters, public.fbla_chapter_members, public.fbla_chapter_bans,
  public.fbla_trainers, public.fbla_attempts, public.fbla_answers, public.fbla_vocab_progress,
  public.fbla_notifications, public.fbla_achievement_defs, public.fbla_achievements, public.fbla_duels,
  public.fbla_friends, public.fbla_attendance_sessions, public.fbla_attendance, public.fbla_posts,
  public.fbla_custom_tests, public.fbla_decks, public.fbla_assignments, public.fbla_questions from anon;

-- profiles: everyone signed in can read; owners update cosmetic columns only; created via fbla_create_profile
create policy fbla_profiles_read on public.fbla_profiles for select to authenticated using (true);
create policy fbla_profiles_update on public.fbla_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.fbla_profiles from authenticated;
grant update (display_name, avatar_url, school, grade, main_event, bio, email_opt_in, username, last_seen_at)
  on public.fbla_profiles to authenticated;

-- chapters: public card for everyone signed in; join_code / invite_token only via fbla_chapter_invite()
create policy fbla_chapters_read on public.fbla_chapters for select to authenticated using (true);
create policy fbla_chapters_insert on public.fbla_chapters for insert to authenticated
  with check ((select auth.uid()) is not null);
create policy fbla_chapters_update on public.fbla_chapters for update to authenticated
  using ((select public.fbla_is_chapter_admin(id))) with check ((select public.fbla_is_chapter_admin(id)));
create policy fbla_chapters_delete on public.fbla_chapters for delete to authenticated
  using (president_id = (select auth.uid()));
revoke select, insert, update on public.fbla_chapters from authenticated;
grant select (id, name, school, region, description, president_id, created_at) on public.fbla_chapters to authenticated;
grant insert (name, school, region, description) on public.fbla_chapters to authenticated;
grant update (name, school, region, description) on public.fbla_chapters to authenticated;

-- members: visible to the same chapter; admins add/edit/remove; anyone can leave
create policy fbla_members_read on public.fbla_chapter_members for select to authenticated
  using (user_id = (select auth.uid()) or chapter_id = (select public.fbla_my_chapter()));
create policy fbla_members_insert on public.fbla_chapter_members for insert to authenticated
  with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_members_update on public.fbla_chapter_members for update to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id))) with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_members_delete on public.fbla_chapter_members for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_is_chapter_admin(chapter_id)));

create policy fbla_bans_read on public.fbla_chapter_bans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_bans_insert on public.fbla_chapter_bans for insert to authenticated
  with check ((select public.fbla_is_chapter_admin(chapter_id)) and user_id <> (select auth.uid()));
create policy fbla_bans_delete on public.fbla_chapter_bans for delete to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)));

create policy fbla_trainers_read on public.fbla_trainers for select to authenticated
  using (chapter_id = (select public.fbla_my_chapter()));
create policy fbla_trainers_insert on public.fbla_trainers for insert to authenticated
  with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_trainers_delete on public.fbla_trainers for delete to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)) or user_id = (select auth.uid()));

-- attempts / answers: own, or chapter staff; written only by fbla_submit_attempt
create policy fbla_attempts_read on public.fbla_attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member(user_id)));
create policy fbla_answers_read on public.fbla_answers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member(user_id)));
revoke insert, update, delete on public.fbla_attempts, public.fbla_answers from authenticated;

-- vocab progress: owner read/write, staff read
create policy fbla_vocab_read on public.fbla_vocab_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member(user_id)));
create policy fbla_vocab_insert on public.fbla_vocab_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy fbla_vocab_update on public.fbla_vocab_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fbla_vocab_delete on public.fbla_vocab_progress for delete to authenticated
  using (user_id = (select auth.uid()));

-- notifications: owner reads, marks read, deletes; inserted by fbla_notify
create policy fbla_notifications_read on public.fbla_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy fbla_notifications_update on public.fbla_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fbla_notifications_delete on public.fbla_notifications for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update on public.fbla_notifications from authenticated;
grant update (read_at) on public.fbla_notifications to authenticated;

-- achievements: public
create policy fbla_achievement_defs_read on public.fbla_achievement_defs for select to authenticated using (true);
create policy fbla_achievements_read on public.fbla_achievements for select to authenticated using (true);
revoke insert, update, delete on public.fbla_achievement_defs, public.fbla_achievements from authenticated;

-- duels: participants read; challenger creates a pending duel; the Arena RPCs do the rest
create policy fbla_duels_read on public.fbla_duels for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()));
create policy fbla_duels_insert on public.fbla_duels for insert to authenticated
  with check (challenger_id = (select auth.uid()) and status = 'pending'
    and challenger_score is null and opponent_score is null and winner_id is null);

-- friends: either side reads; requester inserts pending; addressee accepts; either removes
create policy fbla_friends_read on public.fbla_friends for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy fbla_friends_insert on public.fbla_friends for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy fbla_friends_update on public.fbla_friends for update to authenticated
  using (friend_id = (select auth.uid())) with check (friend_id = (select auth.uid()));
create policy fbla_friends_delete on public.fbla_friends for delete to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));

-- attendance: members see sessions and their own marks; admins manage
create policy fbla_sessions_read on public.fbla_attendance_sessions for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id)));
create policy fbla_sessions_write on public.fbla_attendance_sessions for all to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id))) with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_attendance_read on public.fbla_attendance for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)));
create policy fbla_attendance_write on public.fbla_attendance for all to authenticated
  using (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)))
  with check (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)));

-- classroom content: chapter members read; admins, or trainers for that event, write
create policy fbla_posts_read on public.fbla_posts for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id)));
create policy fbla_posts_insert on public.fbla_posts for insert to authenticated
  with check ((select public.fbla_is_chapter_admin(chapter_id))
    or (event is not null and (select public.fbla_is_chapter_staff(chapter_id, event))));
create policy fbla_posts_update on public.fbla_posts for update to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)) or author_id = (select auth.uid()))
  with check ((select public.fbla_is_chapter_admin(chapter_id))
    or (event is not null and (select public.fbla_is_chapter_staff(chapter_id, event))));
create policy fbla_posts_delete on public.fbla_posts for delete to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)) or author_id = (select auth.uid()));

create policy fbla_tests_read on public.fbla_custom_tests for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id)));
create policy fbla_tests_insert on public.fbla_custom_tests for insert to authenticated
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_tests_update on public.fbla_custom_tests for update to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)))
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_tests_delete on public.fbla_custom_tests for delete to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)));

create policy fbla_decks_read on public.fbla_decks for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id)));
create policy fbla_decks_insert on public.fbla_decks for insert to authenticated
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_decks_update on public.fbla_decks for update to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)))
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_decks_delete on public.fbla_decks for delete to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)));

create policy fbla_assignments_read on public.fbla_assignments for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id)));
create policy fbla_assignments_insert on public.fbla_assignments for insert to authenticated
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_assignments_update on public.fbla_assignments for update to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)))
  with check ((select public.fbla_is_chapter_staff(chapter_id, event)));
create policy fbla_assignments_delete on public.fbla_assignments for delete to authenticated
  using ((select public.fbla_is_chapter_staff(chapter_id, event)));

-- ---------------------------------------------------------------- storage: avatars/<uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy fbla_avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fbla_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fbla_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fbla_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- realtime
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.fbla_notifications, public.fbla_duels;
