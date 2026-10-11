-- 0017 Chapter tests and deck assignments.
--
-- 1. Members could read every key of a published chapter test (fbla_tests_read returned the whole questions JSON,
--    answers included) and so fake an assignment score. The table is now readable only by the people who can edit
--    the test (fbla_can_manage); everyone else in the chapter reads tests through fbla_custom_tests_view, which
--    drops `answer` and `explain` from each question unless the caller manages the test. question_count is a
--    stored column so lists don't need the questions at all.
-- 2. fbla_complete_deck_assignment requires the whole deck (p_total = number of cards). "Known" stays the
--    member's own rating of each card: it is self-reported, and the classroom labels it that way.
-- (fbla_submit_attempt checks test / official assignments against the assigned work since 0014.)

alter table public.fbla_custom_tests
  add column if not exists question_count integer generated always as (jsonb_array_length(questions)) stored;
grant select (question_count) on public.fbla_custom_tests to authenticated;

drop policy if exists fbla_tests_read on public.fbla_custom_tests;
create policy fbla_tests_read on public.fbla_custom_tests for select to authenticated
  using ((select public.fbla_can_manage(chapter_id, event)));

-- Tests of a chapter (p_chapter) and/or specific tests (p_ids) the caller may see: published ones for members,
-- drafts too for the people who manage them. Each row is the table row plus can_manage; questions lose their keys
-- unless can_manage.
create or replace function public.fbla_custom_tests_view(p_chapter uuid default null, p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_chapter is null and p_ids is null then raise exception 'pass a chapter or test ids' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(
             case when x.manage then to_jsonb(x.t) || jsonb_build_object('can_manage', true)
                  else to_jsonb(x.t) || jsonb_build_object('can_manage', false, 'questions', coalesce((
                         select jsonb_agg(q.value - 'answer' - 'explain' order by q.ord)
                         from jsonb_array_elements((x.t).questions) with ordinality q(value, ord)), '[]'::jsonb))
             end
             order by (x.t).updated_at desc)
    from (
      select t, m.manage
      from public.fbla_custom_tests t
      cross join lateral (select public.fbla_can_manage(t.chapter_id, t.event) as manage) m
      where public.fbla_in_chapter(t.chapter_id)
        and (p_chapter is null or t.chapter_id = p_chapter)
        and (p_ids is null or t.id = any (p_ids))
        and (t.published or m.manage)
      order by t.updated_at desc
      limit 200
    ) x), '[]'::jsonb);
end $$;
revoke all on function public.fbla_custom_tests_view(uuid, uuid[]) from public, anon;
grant execute on function public.fbla_custom_tests_view(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------- deck assignment completion
create or replace function public.fbla_complete_deck_assignment(
  p_assignment uuid, p_known int, p_total int, p_duration_ms bigint default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_a public.fbla_assignments;
  v_cards int;
  v_elo int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_a from public.fbla_assignments where id = p_assignment;
  if not found or not public.fbla_in_chapter(v_a.chapter_id) then
    raise exception 'assignment not found' using errcode = '42501';
  end if;
  if v_a.kind <> 'deck' then raise exception 'only deck assignments are completed this way' using errcode = '22023'; end if;
  select jsonb_array_length(d.cards) into v_cards from public.fbla_decks d where d.id::text = v_a.ref;
  if v_cards is null then raise exception 'the deck for this assignment was deleted' using errcode = '22023'; end if;
  if p_total is distinct from v_cards then
    raise exception 'go through every card in the deck to complete this assignment' using errcode = '22023';
  end if;
  if p_known is null or p_known < 0 or p_known > p_total then
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
