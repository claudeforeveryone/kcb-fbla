-- 0011 chapter administration RPCs.
-- Builds on 0006/0007/0009: fbla_chapter_invite, fbla_rotate_chapter_invite, fbla_chapter_preview,
-- fbla_join_chapter (code or invite token, refuses banned users) and fbla_leave_chapter already exist and are reused.
-- Everything here is security definer with search_path '' and executable by `authenticated` only. Writes made
-- inside these functions run as the owner, so the client-write guard triggers in 0006 are skipped and the
-- equivalent checks are made here explicitly. Every change that affects another member notifies them.

-- ---------------------------------------------------------------- helpers (not exposed)
create or replace function fbla_private.fbla_require_admin(p_chapter uuid)
returns public.fbla_role language plpgsql stable security definer set search_path = '' as $$
declare v_role public.fbla_role;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select role into v_role from public.fbla_chapter_members where chapter_id = p_chapter and user_id = auth.uid();
  if v_role is null or v_role not in ('president', 'executive') then
    raise exception 'only the president and executives can do that' using errcode = '42501';
  end if;
  return v_role;
end $$;

create or replace function fbla_private.fbla_chapter_name(p_chapter uuid)
returns text language sql stable security definer set search_path = '' as $$
  select name from public.fbla_chapters where id = p_chapter
$$;

create or replace function fbla_private.fbla_display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(display_name, username) from public.fbla_profiles where id = p_user
$$;

create or replace function fbla_private.fbla_event_name(p_event text)
returns text language sql immutable set search_path = '' as $$
  select case p_event
    when 'accounting' then 'Accounting'
    when 'business-law' then 'Business Law'
    when 'data-science-ai' then 'Data Science & AI'
    when 'personal-finance' then 'Personal Finance'
    when 'securities-investments' then 'Securities & Investments'
    when 'organizational-leadership' then 'Organizational Leadership'
    when 'intro-business-concepts' then 'Introduction to Business Concepts'
    when 'healthcare-administration' then 'Healthcare Administration'
    when 'economics' then 'Economics'
    when 'business-management' then 'Business Management'
    when 'marketing' then 'Marketing'
    when 'international-business' then 'International Business'
    when 'sports-entertainment-management' then 'Sports & Entertainment Management'
    when 'entrepreneurship' then 'Entrepreneurship'
    when 'hospitality-event-management' then 'Hospitality & Event Management'
    else p_event end
$$;

revoke all on function fbla_private.fbla_require_admin(uuid), fbla_private.fbla_chapter_name(uuid),
  fbla_private.fbla_display_name(uuid), fbla_private.fbla_event_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- create
create or replace function public.fbla_create_chapter(
  p_name text, p_school text default null, p_region text default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = v_uid) then
    raise exception 'create your profile first' using errcode = '42501';
  end if;
  if exists (select 1 from public.fbla_chapter_members where user_id = v_uid) then
    raise exception 'you are already in a chapter. Leave it before registering a new one' using errcode = '23505';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'give your chapter a name (at least 2 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.fbla_chapters where lower(name) = lower(btrim(p_name))
             and lower(coalesce(school, '')) = lower(coalesce(nullif(btrim(p_school), ''), ''))) then
    raise exception 'a chapter with that name already exists at that school' using errcode = '23505';
  end if;
  -- the before-insert trigger generates the codes; the after-insert trigger adds the president membership
  insert into public.fbla_chapters (name, school, region, description, president_id)
  values (btrim(p_name), nullif(btrim(p_school), ''), nullif(btrim(p_region), ''), nullif(btrim(p_description), ''), v_uid)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- add by username
create or replace function public.fbla_add_member(p_chapter uuid, p_username text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform fbla_private.fbla_require_admin(p_chapter);
  select id into v_user from public.fbla_profiles where username = lower(btrim(ltrim(btrim(p_username), '@')));
  if v_user is null then raise exception 'no player has that username' using errcode = 'P0002'; end if;
  if exists (select 1 from public.fbla_chapter_members where user_id = v_user and chapter_id = p_chapter) then
    raise exception 'they are already in this chapter' using errcode = '23505';
  end if;
  if exists (select 1 from public.fbla_chapter_members where user_id = v_user) then
    raise exception 'they are already in another chapter' using errcode = '23505';
  end if;
  if exists (select 1 from public.fbla_chapter_bans where chapter_id = p_chapter and user_id = v_user) then
    raise exception 'they are banned from this chapter. Unban them first' using errcode = '42501';
  end if;
  insert into public.fbla_chapter_members (chapter_id, user_id, role) values (p_chapter, v_user, 'member');
  perform public.fbla_notify(v_user, 'chapter_added', 'You were added to ' || fbla_private.fbla_chapter_name(p_chapter),
    fbla_private.fbla_display_name(auth.uid()) || ' added you to the chapter.', '/chapter',
    jsonb_build_object('chapter_id', p_chapter));
  return v_user;
end $$;

-- ---------------------------------------------------------------- roles
-- p_role: executive | trainer | member. Only the president can make or unmake executives.
create or replace function public.fbla_set_role(p_chapter uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.fbla_role := fbla_private.fbla_require_admin(p_chapter);
  v_old public.fbla_role;
  v_new public.fbla_role;
begin
  if p_role not in ('executive', 'trainer', 'member') then
    raise exception 'use the transfer flow to change the president' using errcode = '22023';
  end if;
  v_new := p_role::public.fbla_role;
  if p_user = auth.uid() then raise exception 'you cannot change your own role' using errcode = '42501'; end if;
  select role into v_old from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user for update;
  if v_old is null then raise exception 'they are not in this chapter' using errcode = 'P0002'; end if;
  if v_old = 'president' then raise exception 'use the transfer flow to change the president' using errcode = '42501'; end if;
  if (v_old = 'executive' or v_new = 'executive') and v_me <> 'president' then
    raise exception 'only the president can promote or demote executives' using errcode = '42501';
  end if;
  if v_old = v_new then return; end if;
  update public.fbla_chapter_members set role = v_new where chapter_id = p_chapter and user_id = p_user;
  if v_new = 'member' then
    -- a plain member trains nothing
    delete from public.fbla_trainers where chapter_id = p_chapter and user_id = p_user;
  end if;
  perform public.fbla_notify(p_user, 'chapter_role',
    case v_new when 'executive' then 'You are now an executive'
               when 'trainer' then 'You are now a trainer'
               else 'Your chapter role changed' end,
    'Your role in ' || fbla_private.fbla_chapter_name(p_chapter) || ' is now '
      || initcap(v_new::text) || ' (was ' || initcap(v_old::text) || ').',
    '/chapter', jsonb_build_object('chapter_id', p_chapter, 'role', v_new, 'previous', v_old));
end $$;

-- ---------------------------------------------------------------- trainers per event (replaces the event's list)
create or replace function public.fbla_set_event_trainers(p_chapter uuid, p_event text, p_users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_users uuid[] := array(select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) u where u is not null);
  v_u uuid;
begin
  perform fbla_private.fbla_require_admin(p_chapter);
  if not public.fbla_is_event(p_event) then raise exception 'unknown event %', p_event using errcode = '22023'; end if;
  if cardinality(v_users) > 2 then raise exception 'an event can have at most 2 trainers' using errcode = '23514'; end if;
  if exists (select 1 from unnest(v_users) u
             where not exists (select 1 from public.fbla_chapter_members m where m.chapter_id = p_chapter and m.user_id = u)) then
    raise exception 'trainers must be members of the chapter' using errcode = '22023';
  end if;
  delete from public.fbla_trainers where chapter_id = p_chapter and event = p_event and not (user_id = any (v_users));
  foreach v_u in array v_users loop
    if not exists (select 1 from public.fbla_trainers where chapter_id = p_chapter and event = p_event and user_id = v_u) then
      insert into public.fbla_trainers (chapter_id, user_id, event) values (p_chapter, v_u, p_event);
      if v_u <> auth.uid() then
        perform public.fbla_notify(v_u, 'chapter_role', 'You are a trainer for ' || fbla_private.fbla_event_name(p_event),
          'You can now post, build tests and decks, and assign work for this event in '
            || fbla_private.fbla_chapter_name(p_chapter) || '.',
          '/chapter/classroom', jsonb_build_object('chapter_id', p_chapter, 'event', p_event, 'role', 'trainer'));
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- remove / ban / unban
create or replace function public.fbla_remove_member(p_chapter uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.fbla_role := fbla_private.fbla_require_admin(p_chapter);
  v_role public.fbla_role;
begin
  if p_user = auth.uid() then raise exception 'use Leave chapter to remove yourself' using errcode = '42501'; end if;
  select role into v_role from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user;
  if v_role is null then raise exception 'they are not in this chapter' using errcode = 'P0002'; end if;
  if v_role = 'president' then raise exception 'the president cannot be removed' using errcode = '42501'; end if;
  if v_role = 'executive' and v_me <> 'president' then
    raise exception 'only the president can remove executives' using errcode = '42501';
  end if;
  delete from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user;
  perform public.fbla_notify(p_user, 'chapter_removed', 'You were removed from ' || fbla_private.fbla_chapter_name(p_chapter),
    'You can join another chapter, or ask an executive for a new invite.', '/chapter',
    jsonb_build_object('chapter_id', p_chapter));
end $$;

create or replace function public.fbla_ban_member(p_chapter uuid, p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.fbla_role := fbla_private.fbla_require_admin(p_chapter);
  v_role public.fbla_role;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if p_user = auth.uid() then raise exception 'you cannot ban yourself' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = p_user) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  select role into v_role from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user;
  if v_role = 'president' then raise exception 'the president cannot be banned' using errcode = '42501'; end if;
  if v_role = 'executive' and v_me <> 'president' then
    raise exception 'only the president can ban executives' using errcode = '42501';
  end if;
  insert into public.fbla_chapter_bans (chapter_id, user_id, banned_by, reason)
  values (p_chapter, p_user, auth.uid(), v_reason)
  on conflict (chapter_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by;
  -- the ban trigger removes a new ban's membership; an updated ban still makes sure they are out
  delete from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user;
  perform public.fbla_notify(p_user, 'chapter_banned', 'You were banned from ' || fbla_private.fbla_chapter_name(p_chapter),
    coalesce('Reason: ' || v_reason, 'An executive banned you from the chapter.'), '/chapter',
    jsonb_build_object('chapter_id', p_chapter, 'reason', v_reason));
end $$;

create or replace function public.fbla_unban_member(p_chapter uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform fbla_private.fbla_require_admin(p_chapter);
  delete from public.fbla_chapter_bans where chapter_id = p_chapter and user_id = p_user;
  if not found then raise exception 'they are not banned' using errcode = 'P0002'; end if;
  perform public.fbla_notify(p_user, 'chapter_unbanned', 'Your ban from ' || fbla_private.fbla_chapter_name(p_chapter) || ' was lifted',
    'You can join the chapter again with its code or an invite link.', '/chapter',
    jsonb_build_object('chapter_id', p_chapter));
end $$;

-- ---------------------------------------------------------------- presidency
-- The old president becomes an executive.
create or replace function public.fbla_transfer_presidency(p_chapter uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.fbla_chapter_members
                 where chapter_id = p_chapter and user_id = v_uid and role = 'president') then
    raise exception 'only the president can transfer the chapter' using errcode = '42501';
  end if;
  if p_user = v_uid then raise exception 'you are already the president' using errcode = '22023'; end if;
  if not exists (select 1 from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user) then
    raise exception 'the new president must be a member of the chapter' using errcode = 'P0002';
  end if;
  perform 1 from public.fbla_chapters where id = p_chapter for update;
  update public.fbla_chapter_members set role = 'executive' where chapter_id = p_chapter and user_id = v_uid;
  update public.fbla_chapter_members set role = 'president' where chapter_id = p_chapter and user_id = p_user;
  update public.fbla_chapters set president_id = p_user where id = p_chapter;
  perform public.fbla_notify(p_user, 'chapter_role', 'You are now president of ' || fbla_private.fbla_chapter_name(p_chapter),
    fbla_private.fbla_display_name(v_uid) || ' handed the chapter over to you.', '/chapter/admin',
    jsonb_build_object('chapter_id', p_chapter, 'role', 'president'));
  perform public.fbla_notify(m.user_id, 'chapter_role', 'New chapter president',
    fbla_private.fbla_display_name(p_user) || ' is now president of ' || fbla_private.fbla_chapter_name(p_chapter) || '.',
    '/chapter', jsonb_build_object('chapter_id', p_chapter))
  from public.fbla_chapter_members m
  where m.chapter_id = p_chapter and m.user_id not in (p_user, v_uid) and m.role = 'executive';
end $$;

-- p_confirm must equal the chapter name (case-insensitive), as typed in the danger-zone dialog.
create or replace function public.fbla_delete_chapter(p_chapter uuid, p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := fbla_private.fbla_chapter_name(p_chapter);
begin
  if not exists (select 1 from public.fbla_chapter_members
                 where chapter_id = p_chapter and user_id = v_uid and role = 'president') then
    raise exception 'only the president can delete the chapter' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_name)) then
    raise exception 'type the chapter name exactly to confirm' using errcode = '22023';
  end if;
  perform public.fbla_notify(m.user_id, 'chapter_removed', v_name || ' was closed',
    'The president deleted the chapter. You can join or register another one.', '/chapter',
    jsonb_build_object('chapter_id', p_chapter))
  from public.fbla_chapter_members m where m.chapter_id = p_chapter and m.user_id <> v_uid;
  delete from public.fbla_chapters where id = p_chapter;
end $$;

-- ---------------------------------------------------------------- analytics
-- Chapter-wide numbers for the admin dashboard. Admins and trainers of the chapter.
create or replace function public.fbla_chapter_analytics(p_chapter uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.fbla_today();
  v_result jsonb;
begin
  if not public.fbla_is_chapter_staff(p_chapter) then raise exception 'not allowed' using errcode = '42501'; end if;

  with mem as (
    select m.user_id, m.role, m.joined_at, p.username, p.display_name, p.avatar_url, p.elo, p.peak_elo,
           p.questions_answered, p.questions_correct, p.current_streak, p.last_active_date, p.last_seen_at, p.grade,
           p.main_event
    from public.fbla_chapter_members m join public.fbla_profiles p on p.id = m.user_id
    where m.chapter_id = p_chapter
  ), ans as (
    select a.user_id, a.event, a.sub, a.correct, a.created_at, a.attempt_id
    from public.fbla_answers a
    where a.user_id in (select user_id from mem) and a.question_id not like 'custom:%' and a.event is not null
  ), per_user as (
    select mem.user_id,
           count(ans.created_at) filter (where ans.created_at > now() - interval '7 days')::int as answered_7d,
           count(ans.created_at) filter (where ans.created_at > now() - interval '7 days' and ans.correct)::int as correct_7d,
           count(ans.created_at) filter (where ans.created_at > now() - interval '30 days')::int as answered_30d,
           count(distinct ans.attempt_id) filter (where ans.created_at > now() - interval '7 days')::int as sets_7d,
           max(ans.created_at) as last_answer_at
    from mem left join ans on ans.user_id = mem.user_id
    group by mem.user_id
  ), att as (
    select a.user_id,
           count(*) filter (where a.status in ('present', 'late'))::int as attended,
           count(*) filter (where a.status <> 'excused')::int as counted,
           count(*)::int as marked
    from public.fbla_attendance a join public.fbla_attendance_sessions s on s.id = a.session_id
    where s.chapter_id = p_chapter
    group by a.user_id
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
        'members', count(*),
        'total_elo', coalesce(sum(mem.elo), 0),
        'avg_elo', coalesce(round(avg(mem.elo)), 0),
        'questions_answered', coalesce(sum(mem.questions_answered), 0),
        'questions_correct', coalesce(sum(mem.questions_correct), 0),
        'answered_7d', (select count(*) from ans where created_at > now() - interval '7 days'),
        'correct_7d', (select count(*) from ans where created_at > now() - interval '7 days' and correct),
        'active_7d', (select count(distinct user_id) from ans where created_at > now() - interval '7 days'),
        'sessions', (select count(*) from public.fbla_attendance_sessions where chapter_id = p_chapter))
      from mem),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'user_id', mem.user_id, 'username', mem.username, 'display_name', mem.display_name,
          'avatar_url', mem.avatar_url, 'role', mem.role, 'joined_at', mem.joined_at, 'grade', mem.grade,
          'main_event', mem.main_event, 'elo', mem.elo, 'peak_elo', mem.peak_elo,
          'questions_answered', mem.questions_answered, 'questions_correct', mem.questions_correct,
          'accuracy', case when mem.questions_answered > 0
                           then round(mem.questions_correct::numeric / mem.questions_answered, 4) else null end,
          'current_streak', case when mem.last_active_date >= v_today - 1 then mem.current_streak else 0 end,
          'last_seen_at', mem.last_seen_at,
          'answered_7d', pu.answered_7d, 'correct_7d', pu.correct_7d, 'answered_30d', pu.answered_30d,
          'sets_7d', pu.sets_7d, 'last_answer_at', pu.last_answer_at,
          'attended', coalesce(att.attended, 0), 'attendance_counted', coalesce(att.counted, 0),
          'attendance_rate', case when coalesce(att.counted, 0) > 0
                                  then round(att.attended::numeric / att.counted, 4) else null end)
        order by mem.elo desc, mem.questions_answered desc)
      from mem join per_user pu on pu.user_id = mem.user_id left join att on att.user_id = mem.user_id), '[]'::jsonb),
    'by_event', coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4), 'members', x.u) order by x.n desc)
      from (select event, count(*)::int n, (count(*) filter (where correct))::int c, count(distinct user_id)::int u
            from ans group by event) x), '[]'::jsonb),
    'by_sub', coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'sub', x.sub, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4), 'members', x.u)
             order by x.c::numeric / x.n asc, x.n desc)
      from (select event, sub, count(*)::int n, (count(*) filter (where correct))::int c, count(distinct user_id)::int u
            from ans where sub is not null group by event, sub) x), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'answered', d.n, 'correct', d.c, 'active', d.u) order by d.day)
      from (select (created_at at time zone 'America/Toronto')::date as day, count(*)::int n,
                   (count(*) filter (where correct))::int c, count(distinct user_id)::int u
            from ans where created_at > now() - interval '30 days' group by 1) d), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'fbla_create_chapter(text, text, text, text)', 'fbla_add_member(uuid, text)', 'fbla_set_role(uuid, uuid, text)',
    'fbla_set_event_trainers(uuid, text, uuid[])', 'fbla_remove_member(uuid, uuid)',
    'fbla_ban_member(uuid, uuid, text)', 'fbla_unban_member(uuid, uuid)', 'fbla_transfer_presidency(uuid, uuid)',
    'fbla_delete_chapter(uuid, text)', 'fbla_chapter_analytics(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
