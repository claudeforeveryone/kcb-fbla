-- 0013 classroom: posts, newsletters, custom tests, decks, assignments.
-- Builds on the tables created in 0006 (fbla_posts, fbla_custom_tests, fbla_decks, fbla_assignments).
--  * posts: updated_at, validation, immutable chapter/author on update
--  * custom tests: published flag (drafts are visible to staff only)
--  * assignments: options jsonb (official paper choice), ref validated, event derived from the referenced item
--  * stricter write policies: trainers only for their own events; newsletters are president/executive only
--  * notifications and newsletter emails for posts and assignments are owned by 0012_email (deferred triggers)
--  * fbla_complete_deck_assignment: records a deck assignment as done (an attempt row with that assignment_id)

-- ---------------------------------------------------------------- columns
alter table public.fbla_posts add column if not exists updated_at timestamptz not null default now();

alter table public.fbla_custom_tests add column if not exists published boolean not null default false;
alter table public.fbla_decks add column if not exists updated_at timestamptz not null default now();
alter table public.fbla_assignments add column if not exists options jsonb not null default '{}'::jsonb;
alter table public.fbla_assignments drop constraint if exists fbla_assignments_options_obj;
alter table public.fbla_assignments add constraint fbla_assignments_options_obj check (jsonb_typeof(options) = 'object');

-- ---------------------------------------------------------------- permission helper
-- admin of the chapter, or a trainer of that chapter for exactly this (non-null) event
create or replace function public.fbla_can_manage(p_chapter uuid, p_event text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fbla_is_chapter_admin(p_chapter) or (
    p_event is not null and exists (
      select 1 from public.fbla_trainers t
      where t.chapter_id = p_chapter and t.user_id = (select auth.uid()) and t.event = p_event
    )
  )
$$;
revoke all on function public.fbla_can_manage(uuid, text) from public, anon;
grant execute on function public.fbla_can_manage(uuid, text) to authenticated;

-- ---------------------------------------------------------------- posts
create or replace function public.fbla_posts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  if new.event is not null and not public.fbla_is_event(new.event) then
    raise exception 'unknown event %', new.event using errcode = '22023';
  end if;
  if new.kind = 'link' and coalesce(btrim(new.url), '') = '' then
    raise exception 'a link post needs a URL' using errcode = '22023';
  end if;
  if new.url is not null and btrim(new.url) <> '' and new.url !~* '^https?://' then
    raise exception 'links must start with http:// or https://' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.updated_at := now();
    if current_user = 'authenticated' then new.author_id := (select auth.uid()); end if;
  else
    if current_user = 'authenticated' then
      new.chapter_id := old.chapter_id;
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
    -- only a real content edit bumps updated_at (pinning does not)
    if (new.title, new.body, new.url, new.event, new.kind) is distinct from
       (old.title, old.body, old.url, old.event, old.kind) then
      new.updated_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fbla_posts_guard on public.fbla_posts;
create trigger fbla_posts_guard before insert or update on public.fbla_posts
  for each row execute function public.fbla_posts_guard();

drop policy if exists fbla_posts_insert on public.fbla_posts;
drop policy if exists fbla_posts_update on public.fbla_posts;
drop policy if exists fbla_posts_delete on public.fbla_posts;
create policy fbla_posts_insert on public.fbla_posts for insert to authenticated
  with check (
    case when kind = 'newsletter' then (select public.fbla_is_chapter_admin(chapter_id))
         else (select public.fbla_can_manage(chapter_id, event)) end);
create policy fbla_posts_update on public.fbla_posts for update to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id))
         or (author_id = (select auth.uid()) and (select public.fbla_can_manage(chapter_id, event))))
  with check (
    case when kind = 'newsletter' then (select public.fbla_is_chapter_admin(chapter_id))
         else (select public.fbla_can_manage(chapter_id, event)) end);
create policy fbla_posts_delete on public.fbla_posts for delete to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)) or author_id = (select auth.uid()));

-- ---------------------------------------------------------------- custom tests
create or replace function public.fbla_custom_tests_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  q jsonb;
  i int := 0;
begin
  new.title := btrim(new.title);
  if new.event is not null and not public.fbla_is_event(new.event) then
    raise exception 'unknown event %', new.event using errcode = '22023';
  end if;
  if jsonb_array_length(new.questions) > 200 then
    raise exception 'a test can have at most 200 questions' using errcode = '22023';
  end if;
  for q in select value from jsonb_array_elements(new.questions) loop
    i := i + 1;
    if jsonb_typeof(q) <> 'object'
       or jsonb_typeof(q->'q') <> 'string' or char_length(btrim(q->>'q')) = 0 or char_length(q->>'q') > 2000
       or jsonb_typeof(q->'choices') <> 'array' or jsonb_array_length(q->'choices') <> 4
       or exists (select 1 from jsonb_array_elements(q->'choices') c
                  where jsonb_typeof(c) <> 'string' or char_length(btrim(c #>> '{}')) = 0 or char_length(c #>> '{}') > 500)
       or jsonb_typeof(q->'answer') <> 'number' or (q->>'answer')::numeric not in (0, 1, 2, 3)
       or (q ? 'explain' and jsonb_typeof(q->'explain') not in ('string', 'null'))
       or char_length(coalesce(q->>'explain', '')) > 2000 then
      raise exception 'question % needs text, 4 filled-in choices and a correct answer', i using errcode = '22023';
    end if;
  end loop;
  if new.published and jsonb_array_length(new.questions) = 0 then
    raise exception 'add at least one question before publishing' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and current_user = 'authenticated' then new.author_id := (select auth.uid()); end if;
  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    new.chapter_id := old.chapter_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists fbla_custom_tests_guard on public.fbla_custom_tests;
create trigger fbla_custom_tests_guard before insert or update on public.fbla_custom_tests
  for each row execute function public.fbla_custom_tests_guard();

drop policy if exists fbla_tests_read on public.fbla_custom_tests;
drop policy if exists fbla_tests_insert on public.fbla_custom_tests;
drop policy if exists fbla_tests_update on public.fbla_custom_tests;
drop policy if exists fbla_tests_delete on public.fbla_custom_tests;
create policy fbla_tests_read on public.fbla_custom_tests for select to authenticated
  using ((select public.fbla_in_chapter(chapter_id))
         and (published or (select public.fbla_can_manage(chapter_id, event))));
create policy fbla_tests_insert on public.fbla_custom_tests for insert to authenticated
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_tests_update on public.fbla_custom_tests for update to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)))
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_tests_delete on public.fbla_custom_tests for delete to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)));

-- ---------------------------------------------------------------- decks
create or replace function public.fbla_decks_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  if new.event is not null and not public.fbla_is_event(new.event) then
    raise exception 'unknown event %', new.event using errcode = '22023';
  end if;
  if jsonb_array_length(new.cards) > 500 then
    raise exception 'a deck can have at most 500 cards' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(new.cards) c
             where jsonb_typeof(c) <> 'object'
                or jsonb_typeof(c->'term') <> 'string' or char_length(btrim(c->>'term')) = 0
                or char_length(c->>'term') > 300
                or jsonb_typeof(c->'def') <> 'string' or char_length(btrim(c->>'def')) = 0
                or char_length(c->>'def') > 1500) then
    raise exception 'every card needs a term and a definition' using errcode = '22023';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' and current_user = 'authenticated' then new.author_id := (select auth.uid()); end if;
  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    new.chapter_id := old.chapter_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists fbla_decks_guard on public.fbla_decks;
create trigger fbla_decks_guard before insert or update on public.fbla_decks
  for each row execute function public.fbla_decks_guard();

drop policy if exists fbla_decks_insert on public.fbla_decks;
drop policy if exists fbla_decks_update on public.fbla_decks;
drop policy if exists fbla_decks_delete on public.fbla_decks;
create policy fbla_decks_insert on public.fbla_decks for insert to authenticated
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_decks_update on public.fbla_decks for update to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)))
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_decks_delete on public.fbla_decks for delete to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)));

-- ---------------------------------------------------------------- assignments
-- ref must point at a test / deck of the same chapter (or an event slug for official papers); event is derived
-- from it so the trainer-per-event policy applies to what is actually assigned. Assigning a draft publishes it.
create or replace function public.fbla_assignments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_test public.fbla_custom_tests;
  v_deck public.fbla_decks;
  v_paper text;
begin
  new.title := btrim(new.title);
  if tg_op = 'INSERT' and (select auth.uid()) is not null then new.assigned_by := (select auth.uid()); end if;
  if tg_op = 'UPDATE' and (select auth.uid()) is not null then
    new.chapter_id := old.chapter_id;
    new.assigned_by := old.assigned_by;
    new.created_at := old.created_at;
  end if;
  if new.kind = 'test' then
    select * into v_test from public.fbla_custom_tests where id::text = new.ref and chapter_id = new.chapter_id;
    if not found then raise exception 'that test is not in this chapter' using errcode = '22023'; end if;
    if jsonb_array_length(v_test.questions) = 0 then
      raise exception 'that test has no questions yet' using errcode = '22023';
    end if;
    new.event := v_test.event;
    new.options := '{}'::jsonb;
    if not v_test.published and public.fbla_can_manage(new.chapter_id, v_test.event) then
      update public.fbla_custom_tests set published = true where id = v_test.id;
    end if;
  elsif new.kind = 'deck' then
    select * into v_deck from public.fbla_decks where id::text = new.ref and chapter_id = new.chapter_id;
    if not found then raise exception 'that deck is not in this chapter' using errcode = '22023'; end if;
    if jsonb_array_length(v_deck.cards) = 0 then
      raise exception 'that deck has no cards yet' using errcode = '22023';
    end if;
    new.event := v_deck.event;
    new.options := '{}'::jsonb;
  else
    if not public.fbla_is_event(new.ref) then raise exception 'unknown event %', new.ref using errcode = '22023'; end if;
    new.event := new.ref;
    v_paper := coalesce(new.options->>'paper', 'A');
    if v_paper not in ('A', 'B', 'full') then raise exception 'paper must be A, B or full' using errcode = '22023'; end if;
    new.options := jsonb_build_object('paper', v_paper);
  end if;
  return new;
end $$;
revoke all on function public.fbla_assignments_guard() from public, anon, authenticated;
drop trigger if exists fbla_assignments_guard on public.fbla_assignments;
create trigger fbla_assignments_guard before insert or update on public.fbla_assignments
  for each row execute function public.fbla_assignments_guard();

drop policy if exists fbla_assignments_insert on public.fbla_assignments;
drop policy if exists fbla_assignments_update on public.fbla_assignments;
drop policy if exists fbla_assignments_delete on public.fbla_assignments;
create policy fbla_assignments_insert on public.fbla_assignments for insert to authenticated
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_assignments_update on public.fbla_assignments for update to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)))
  with check ((select public.fbla_can_manage(chapter_id, event)));
create policy fbla_assignments_delete on public.fbla_assignments for delete to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)));

-- ---------------------------------------------------------------- deck assignment completion
-- Records that the caller studied an assigned deck: an attempt (kind 'assignment') with the assignment id,
-- total = cards studied, correct = cards marked as known. No Elo, no answer rows.
create or replace function public.fbla_complete_deck_assignment(
  p_assignment uuid, p_known int, p_total int, p_duration_ms bigint default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_a public.fbla_assignments;
  v_elo int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_a from public.fbla_assignments where id = p_assignment;
  if not found or not public.fbla_in_chapter(v_a.chapter_id) then
    raise exception 'assignment not found' using errcode = '42501';
  end if;
  if v_a.kind <> 'deck' then raise exception 'only deck assignments are completed this way' using errcode = '22023'; end if;
  if p_total is null or p_total < 1 or p_total > 500 or p_known is null or p_known < 0 or p_known > p_total then
    raise exception 'bad card counts' using errcode = '22023';
  end if;
  select elo into v_elo from public.fbla_profiles where id = v_uid;
  if not found then raise exception 'create your profile first' using errcode = '42501'; end if;
  insert into public.fbla_attempts (user_id, kind, event, label, total, correct, duration_ms, elo_before, elo_after,
                                    assignment_id)
  values (v_uid, 'assignment', v_a.event, left(v_a.title, 160), p_total, p_known,
          least(greatest(coalesce(p_duration_ms, 0), 0), 86400000), v_elo, v_elo, v_a.id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fbla_complete_deck_assignment(uuid, int, int, bigint) from public, anon;
grant execute on function public.fbla_complete_deck_assignment(uuid, int, int, bigint) to authenticated;
