-- 0016 Chapter permissions.
--
-- 1. Membership, bans and trainer rows are written only by the security-definer RPCs (fbla_add_member,
--    fbla_ban_member, fbla_remove_member, fbla_set_role, fbla_set_event_trainers, fbla_join_chapter,
--    fbla_leave_chapter, ...), which hold the role rules (only the president bans or removes an executive, trainers
--    must be members, ...). Direct INSERT / UPDATE / DELETE from clients bypassed those rules, e.g. an executive could
--    ban another executive with a plain insert into fbla_chapter_bans. Clients now only read these tables.
--    The ban trigger also checks the executive rule itself.
-- 2. Trainers see member activity only for their own events. fbla_can_view_member is self or president/executive;
--    fbla_can_view_member_event (0014) adds trainers for one event. Answers, attempts, profile stats, weak spots
--    and chapter analytics follow that; attendance stays admin-only.

-- ---------------------------------------------------------------- direct writes: RPCs only
revoke insert, update, delete on public.fbla_chapter_bans from authenticated;
revoke insert, update, delete on public.fbla_chapter_members from authenticated;
revoke insert, update, delete on public.fbla_trainers from authenticated;
drop policy if exists fbla_bans_insert on public.fbla_chapter_bans;
drop policy if exists fbla_bans_update on public.fbla_chapter_bans;
drop policy if exists fbla_bans_delete on public.fbla_chapter_bans;
drop policy if exists fbla_members_insert on public.fbla_chapter_members;
drop policy if exists fbla_members_update on public.fbla_chapter_members;
drop policy if exists fbla_members_delete on public.fbla_chapter_members;
drop policy if exists fbla_trainers_insert on public.fbla_trainers;
drop policy if exists fbla_trainers_update on public.fbla_trainers;
drop policy if exists fbla_trainers_delete on public.fbla_trainers;

-- a ban removes the membership; nobody bans the president, and only the president bans an executive
create or replace function public.fbla_bans_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_target public.fbla_role;
  v_caller public.fbla_role;
begin
  select role into v_target from public.fbla_chapter_members where chapter_id = new.chapter_id and user_id = new.user_id;
  if v_target = 'president' then
    raise exception 'cannot ban the president' using errcode = '42501';
  end if;
  if v_target = 'executive' and (select auth.uid()) is not null then
    select role into v_caller from public.fbla_chapter_members
      where chapter_id = new.chapter_id and user_id = (select auth.uid());
    if v_caller is distinct from 'president' then
      raise exception 'only the president can ban executives' using errcode = '42501';
    end if;
  end if;
  delete from public.fbla_chapter_members where chapter_id = new.chapter_id and user_id = new.user_id;
  return new;
end $$;
revoke all on function public.fbla_bans_after_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------- who sees member activity
-- self, or president / executive of the member's chapter (trainers go through fbla_can_view_member_event)
create or replace function public.fbla_can_view_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) or exists (
    select 1 from public.fbla_chapter_members m
    where m.user_id = p_user and public.fbla_is_chapter_admin(m.chapter_id)
  )
$$;

-- The events whose activity the caller may see for this member: null = all (self or admin), otherwise the events
-- the caller trains in the member's chapter (possibly none).
create or replace function public.fbla_viewer_events(p_user uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when public.fbla_can_view_member(p_user) then null
    else coalesce((
      select array_agg(t.event)
      from public.fbla_chapter_members m
      join public.fbla_trainers t on t.chapter_id = m.chapter_id and t.user_id = (select auth.uid())
      where m.user_id = p_user), '{}'::text[])
  end
$$;
revoke all on function public.fbla_viewer_events(uuid) from public, anon;
grant execute on function public.fbla_viewer_events(uuid) to authenticated;

drop policy if exists fbla_answers_read on public.fbla_answers;
create policy fbla_answers_read on public.fbla_answers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member_event(user_id, event)));

drop policy if exists fbla_attempts_read on public.fbla_attempts;
create policy fbla_attempts_read on public.fbla_attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member_event(user_id, event)));

-- vocab progress: admins (and self) for now; 0018 adds trainers for their events' terms
drop policy if exists fbla_vocab_read on public.fbla_vocab_progress;
create policy fbla_vocab_read on public.fbla_vocab_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fbla_can_view_member(user_id)));

-- ---------------------------------------------------------------- weak spots / profile stats: trainer-scoped
create or replace function public.fbla_weak_spots(p_user uuid default null)
returns table (
  event text, sub text, answered int, correct int, accuracy numeric, attempts int, last_answered_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_events text[];
begin
  if v_user is null or auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  v_events := public.fbla_viewer_events(v_user);
  if v_events is not null and cardinality(v_events) = 0 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.event, a.sub, count(*)::int, (count(*) filter (where a.correct))::int,
           round((count(*) filter (where a.correct))::numeric / count(*), 4),
           count(distinct a.attempt_id)::int, max(a.created_at)
    from public.fbla_answers a
    where a.user_id = v_user and a.question_id not like 'custom:%' and a.event is not null and a.sub is not null
      and (v_events is null or a.event = any (v_events))
    group by a.event, a.sub
    order by 5 asc, 3 desc, 1, 2;
end $$;

-- Anyone signed in can see the public parts; per-area accuracy and recent attempts only for self, chapter admins,
-- and (limited to their events) the member's trainers.
create or replace function public.fbla_profile_stats(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_prof public.fbla_profiles;
  v_events text[];
  v_private boolean;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_prof from public.fbla_profiles where id = v_user;
  if not found then return null; end if;
  v_events := public.fbla_viewer_events(v_user);
  v_private := v_events is null or cardinality(v_events) > 0;

  select jsonb_build_object(
    'profile', to_jsonb(v_prof) - 'elo_exact' - case when v_user = auth.uid() then '' else 'email_opt_in' end,
    'chapter', (select jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role)
                from public.fbla_chapter_members m join public.fbla_chapters c on c.id = m.chapter_id
                where m.user_id = v_user),
    'rank', (select count(*) + 1 from public.fbla_profiles where elo > v_prof.elo),
    'players', (select count(*) from public.fbla_profiles),
    'questions_answered', v_prof.questions_answered,
    'questions_correct', v_prof.questions_correct,
    'accuracy', case when v_prof.questions_answered > 0
                     then round(v_prof.questions_correct::numeric / v_prof.questions_answered, 4) else 0 end,
    'time_spent_ms', v_prof.time_spent_ms,
    'current_streak', case when v_prof.last_active_date >= public.fbla_today() - 1 then v_prof.current_streak else 0 end,
    'best_streak', v_prof.best_streak,
    'best_answer_streak', v_prof.best_answer_streak,
    'attempts_count', (select count(*) from public.fbla_attempts where user_id = v_user),
    'by_event', coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4), 'elo', x.elo) order by x.n desc)
      from (select a.event, count(*)::int n, (count(*) filter (where a.correct))::int c,
                   greatest(0, sum(a.elo_delta))::int elo
            from public.fbla_answers a
            where a.user_id = v_user and a.event is not null and a.question_id not like 'custom:%'
            group by a.event) x), '[]'::jsonb),
    'by_sub', case when v_private then coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event, 'sub', x.sub, 'answered', x.n, 'correct', x.c,
               'accuracy', round(x.c::numeric / x.n, 4)) order by x.event, x.sub)
      from (select a.event, a.sub, count(*)::int n, (count(*) filter (where a.correct))::int c
            from public.fbla_answers a
            where a.user_id = v_user and a.event is not null and a.sub is not null and a.question_id not like 'custom:%'
              and (v_events is null or a.event = any (v_events))
            group by a.event, a.sub) x), '[]'::jsonb) else null end,
    'best_paper', (
      select jsonb_build_object('attempt_id', t.id, 'kind', t.kind, 'event', t.event, 'label', t.label,
               'correct', t.correct, 'total', t.total, 'accuracy', round(t.correct::numeric / t.total, 4),
               'created_at', t.created_at)
      from public.fbla_attempts t
      where t.user_id = v_user and t.total >= 10
      order by t.correct::numeric / t.total desc, t.total desc, t.created_at desc limit 1),
    'elo_history', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'elo', d.elo) order by d.day)
      from (select distinct on ((t.created_at at time zone 'America/Toronto')::date)
                   (t.created_at at time zone 'America/Toronto')::date as day, t.elo_after as elo
            from public.fbla_attempts t
            where t.user_id = v_user and t.created_at > now() - interval '365 days'
            order by (t.created_at at time zone 'America/Toronto')::date, t.created_at desc) d), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'answered', d.n) order by d.day)
      from (select (a.created_at at time zone 'America/Toronto')::date as day, count(*)::int n
            from public.fbla_answers a
            where a.user_id = v_user and a.created_at > now() - interval '182 days'
            group by 1) d), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.code, 'earned_at', x.earned_at) order by x.earned_at desc)
      from public.fbla_achievements x where x.user_id = v_user), '[]'::jsonb),
    'recent_attempts', case when v_private then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (select t.id, t.kind, t.event, t.label, t.total, t.correct, t.duration_ms, t.elo_before, t.elo_after,
                   t.created_at
            from public.fbla_attempts t
            where t.user_id = v_user and (v_events is null or t.event = any (v_events))
            order by t.created_at desc limit 10) r), '[]'::jsonb) else null end,
    'can_view_private', v_private,
    'private_events', to_jsonb(v_events)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------- chapter analytics
-- President / executive: the whole chapter. Trainer: the same dashboard limited to the events they train, with no
-- attendance (that stays admin-only).
create or replace function public.fbla_chapter_analytics(p_chapter uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.fbla_today();
  v_admin boolean := public.fbla_is_chapter_admin(p_chapter);
  v_events text[];
  v_result jsonb;
begin
  if not v_admin then
    select array_agg(t.event) into v_events
    from public.fbla_trainers t where t.chapter_id = p_chapter and t.user_id = auth.uid();
    if v_events is null then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;

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
      and (v_events is null or a.event = any (v_events))
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
    where s.chapter_id = p_chapter and v_admin
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
        'sessions', case when v_admin
                         then (select count(*) from public.fbla_attendance_sessions where chapter_id = p_chapter)
                         else 0 end)
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
    'scope', case when v_admin then 'chapter' else 'trainer' end,
    'events', to_jsonb(v_events),
    'generated_at', now()
  ) into v_result;
  return v_result;
end $$;
