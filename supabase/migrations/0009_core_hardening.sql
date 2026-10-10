-- 0009 advisor fixes for the core schema.
-- 1. The join-code / invite-token generators don't belong in the REST API: move them to a private schema.
-- 2. Attendance write policies were `for all`, overlapping the select policies: split per action.

create schema if not exists fbla_private;
revoke all on schema fbla_private from public, anon;
grant usage on schema fbla_private to authenticated;

alter function public.fbla_new_join_code() set schema fbla_private;
alter function public.fbla_new_invite_token() set schema fbla_private;

create or replace function public.fbla_chapters_before_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.join_code := fbla_private.fbla_new_join_code();
  new.invite_token := fbla_private.fbla_new_invite_token();
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

create or replace function public.fbla_rotate_chapter_invite(p_chapter uuid, p_what text default 'both')
returns table (join_code text, invite_token text) language plpgsql security definer set search_path = '' as $$
begin
  if not public.fbla_is_chapter_admin(p_chapter) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.fbla_chapters c set
    join_code = case when p_what in ('code', 'both') then fbla_private.fbla_new_join_code() else c.join_code end,
    invite_token = case when p_what in ('token', 'both') then fbla_private.fbla_new_invite_token() else c.invite_token end
  where c.id = p_chapter;
  return query select c.join_code, c.invite_token from public.fbla_chapters c where c.id = p_chapter;
end $$;

drop policy if exists fbla_sessions_write on public.fbla_attendance_sessions;
create policy fbla_sessions_insert on public.fbla_attendance_sessions for insert to authenticated
  with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_sessions_update on public.fbla_attendance_sessions for update to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id))) with check ((select public.fbla_is_chapter_admin(chapter_id)));
create policy fbla_sessions_delete on public.fbla_attendance_sessions for delete to authenticated
  using ((select public.fbla_is_chapter_admin(chapter_id)));

drop policy if exists fbla_attendance_write on public.fbla_attendance;
create policy fbla_attendance_insert on public.fbla_attendance for insert to authenticated
  with check (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)));
create policy fbla_attendance_update on public.fbla_attendance for update to authenticated
  using (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)))
  with check (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)));
create policy fbla_attendance_delete on public.fbla_attendance for delete to authenticated
  using (exists (select 1 from public.fbla_attendance_sessions s
    where s.id = session_id and public.fbla_is_chapter_admin(s.chapter_id)));
