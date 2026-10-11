-- 0106 FBLA owner actions (Omega owner console). Ledger name: fbla_0106_owner_actions.
--
-- Feedback triage (with the reported question and its key), audit search, minimal user search, the audited
-- support-email lookup, and owner wrappers for chapter bans and roles. An owner needs only a signed-in account, not a
-- student profile, so nothing here writes auth.uid() into a column that references fbla_profiles. Every function starts with the public.is_platform_owner() check. Writes are audited:
-- feedback and support lookups call fbla_private.fbla_audit directly; ban and role changes are caught by the 0104
-- triggers, which read the transaction-local settings these wrappers set (fbla.via = 'owner_console', fbla.reason)
-- and clear again before returning, so nothing later in the same transaction is attributed to the console.
-- The wrappers repeat the chapter rules themselves (the chapter RPCs only admit that chapter's admins, and the
-- owner is not a member of every chapter): the president is never banned or demoted here (transfer flow only), and
-- an executive must be demoted before a ban, matching what the chapter's own triggers enforce.

-- Feedback inbox. p_status: one status, 'open' (new + triaged + in progress) or null for all. High priority first,
-- then newest. Returns the page, the filtered total, and per-status counts for the tabs.
create or replace function public.fbla_owner_feedback_list(
  p_status text default 'open', p_kind text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_statuses text[];
  v_total bigint;
  v_rows jsonb;
  v_counts jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status is null then
    v_statuses := array['new', 'triaged', 'in_progress', 'resolved', 'wontfix'];
  elsif p_status = 'open' then
    v_statuses := array['new', 'triaged', 'in_progress'];
  elsif p_status in ('new', 'triaged', 'in_progress', 'resolved', 'wontfix') then
    v_statuses := array[p_status];
  else
    raise exception 'unknown status' using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('bug', 'feature', 'general', 'question_issue', 'resource_issue', 'accessibility') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;

  select count(*) into v_total
    from public.fbla_feedback f
   where f.status = any (v_statuses) and (p_kind is null or f.kind = p_kind);

  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_priority' order by x.sort_priority, x.created_at desc), '[]'::jsonb)
    into v_rows
    from (select f.id, f.kind, f.message, f.page_path, f.question_id, f.status, f.priority, f.resolution_note,
                 f.created_at, f.updated_at, f.resolved_at, f.user_id,
                 p.username, p.display_name,
                 q.event as question_event,
                 case f.priority when 'high' then 0 when 'normal' then 1 else 2 end as sort_priority
            from public.fbla_feedback f
            left join public.fbla_profiles p on p.id = f.user_id
            left join public.fbla_questions q on q.id = f.question_id
           where f.status = any (v_statuses) and (p_kind is null or f.kind = p_kind)
           order by case f.priority when 'high' then 0 when 'normal' then 1 else 2 end, f.created_at desc
           limit v_limit offset v_offset) x;

  select jsonb_build_object(
           'new', count(*) filter (where f.status = 'new'),
           'triaged', count(*) filter (where f.status = 'triaged'),
           'in_progress', count(*) filter (where f.status = 'in_progress'),
           'resolved', count(*) filter (where f.status = 'resolved'),
           'wontfix', count(*) filter (where f.status = 'wontfix'))
    into v_counts
    from public.fbla_feedback f
   where p_kind is null or f.kind = p_kind;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'counts', v_counts);
end;
$$;

-- Feedback triage: status, priority and the note the reporter sees (null keeps the current value, '' clears the note).
create or replace function public.fbla_owner_feedback_update(
  p_id uuid, p_status text default null, p_priority text default null, p_resolution_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.fbla_feedback%rowtype;
  v_new public.fbla_feedback%rowtype;
  v_status text;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new', 'triaged', 'in_progress', 'resolved', 'wontfix') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high') then
    raise exception 'unknown priority' using errcode = '22023';
  end if;
  if p_resolution_note is not null and char_length(btrim(p_resolution_note)) > 1000 then
    raise exception 'keep the note under 1,000 characters' using errcode = '22023';
  end if;

  select * into v_old from public.fbla_feedback where id = p_id for update;
  if not found then
    raise exception 'feedback not found' using errcode = 'P0002';
  end if;
  v_status := coalesce(p_status, v_old.status);

  update public.fbla_feedback
     set status = v_status,
         priority = coalesce(p_priority, priority),
         resolution_note = case when p_resolution_note is null then resolution_note
                                else nullif(btrim(p_resolution_note), '') end,
         reviewed_by = auth.uid(),
         resolved_at = case when v_status in ('resolved', 'wontfix') then coalesce(resolved_at, now()) end
   where id = p_id
   returning * into v_new;

  perform fbla_private.fbla_audit('feedback_updated', 'feedback', p_id::text,
    jsonb_build_object('from', v_old.status, 'to', v_new.status,
                       'priority', v_new.priority,
                       'note_changed', v_old.resolution_note is distinct from v_new.resolution_note));

  return jsonb_build_object(
    'id', v_new.id, 'status', v_new.status, 'priority', v_new.priority,
    'resolution_note', v_new.resolution_note, 'resolved_at', v_new.resolved_at, 'updated_at', v_new.updated_at);
end;
$$;

-- One official question with its key, for judging a question report in triage: the stem, the choices, the keyed
-- answer (0-based) and the explanation. Owners only; students get keys only through the grading RPCs (0014).
create or replace function public.fbla_owner_question(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object('id', q.id, 'event', q.event, 'area', q.sub, 'difficulty', q.diff, 'question', q.q,
                            'choices', q.choices, 'answer', q.answer, 'explanation', q.explain)
    into v_q
    from public.fbla_questions q
   where q.id = p_id;
  if v_q is null then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  return v_q;
end;
$$;

-- Audit search: last p_days (1 to 730), optional exact action, optional text over action, target, detail and the
-- actor's username. Newest first. Also returns the distinct actions in the window for the filter menu.
create or replace function public.fbla_owner_audit_search(
  p_days int default 90, p_action text default null, p_q text default null,
  p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 1), 730);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_total bigint;
  v_rows jsonb;
  v_actions jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_q) > 80 then
    raise exception 'search is too long' using errcode = '22023';
  end if;

  with hits as (
    select a.id, a.created_at, a.action, a.target_type, a.target_id, a.detail, a.actor_id,
           p.username as actor_username, t.username as target_username
      from public.fbla_audit_log a
      left join public.fbla_profiles p on p.id = a.actor_id
      left join public.fbla_profiles t
        on a.target_type in ('chapter_member', 'user')
       and t.id = case when a.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then a.target_id::uuid end
     where a.created_at >= v_since
       and (p_action is null or a.action = p_action)
       and (v_q = ''
            or strpos(a.action, v_q) > 0
            or strpos(lower(coalesce(a.target_id, '')), v_q) > 0
            or strpos(lower(a.detail::text), v_q) > 0
            or strpos(lower(coalesce(p.username, '')), v_q) > 0
            or strpos(lower(coalesce(t.username, '')), v_q) > 0)
  )
  select (select count(*) from hits),
         coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id desc)
                     from (select * from hits order by created_at desc, id desc limit v_limit offset v_offset) h),
                  '[]'::jsonb)
    into v_total, v_rows;

  select coalesce(jsonb_agg(distinct a.action), '[]'::jsonb) into v_actions
    from public.fbla_audit_log a
   where a.created_at >= v_since;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'actions', v_actions);
end;
$$;

-- User search by username, display name, or exact user id. Minimal fields: no email, school, grade, bio, avatar or
-- study data. Chapter membership and chapter bans are included because the safe actions act on them.
create or replace function public.fbla_owner_user_search(p_query text, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_id uuid;
  v_rows jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 60 then
    return '[]'::jsonb;
  end if;
  if v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_q::uuid;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_exact' order by x.sort_exact desc, x.username), '[]'::jsonb)
    into v_rows
    from (select p.id as user_id, p.username, p.display_name, p.created_at, p.last_seen_at,
                 m.chapter_id, c.name as chapter_name, m.role::text as chapter_role,
                 coalesce((select jsonb_agg(jsonb_build_object('chapter_id', b.chapter_id, 'chapter_name', bc.name)
                                            order by bc.name)
                             from public.fbla_chapter_bans b
                             join public.fbla_chapters bc on bc.id = b.chapter_id
                            where b.user_id = p.id), '[]'::jsonb) as bans,
                 coalesce(p.id = v_id or lower(p.username) = v_q, false) as sort_exact
            from public.fbla_profiles p
            left join public.fbla_chapter_members m on m.user_id = p.id
            left join public.fbla_chapters c on c.id = m.chapter_id
           where p.id = v_id
              or strpos(lower(p.username), v_q) > 0
              or strpos(lower(p.display_name), v_q) > 0
           order by coalesce(p.id = v_id or lower(p.username) = v_q, false) desc, p.username
           limit v_limit) x;

  return v_rows;
end;
$$;

-- Support: the only place an email address is returned. Needs a written reason (10+ characters), and every lookup
-- writes an audit row with that reason, so this function is volatile.
create or replace function public.fbla_owner_support_email(p_user uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_email text;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 200 then
    raise exception 'give a reason of 10 to 200 characters' using errcode = '22023';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  perform fbla_private.fbla_audit('support_email_viewed', 'user', p_user::text,
    jsonb_build_object('reason', v_reason));

  return jsonb_build_object('user_id', p_user, 'email', v_email);
end;
$$;

-- Ban from (p_banned = true) or unban from a chapter, as the owner. Notifies the member like the chapter tools do.
create or replace function public.fbla_owner_set_chapter_ban(
  p_user uuid, p_chapter uuid, p_banned boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_name text;
  v_role public.fbla_role;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_user is null or p_chapter is null or p_banned is null then
    raise exception 'user, chapter and action are required' using errcode = '22023';
  end if;
  select c.name into v_name from public.fbla_chapters c where c.id = p_chapter;
  if not found then
    raise exception 'chapter not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.fbla_profiles where id = p_user) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  perform set_config('fbla.via', 'owner_console', true);
  perform set_config('fbla.reason', coalesce(left(v_reason, 200), ''), true);

  if p_banned then
    select m.role into v_role from public.fbla_chapter_members m where m.chapter_id = p_chapter and m.user_id = p_user;
    if v_role = 'president' then
      raise exception 'the president cannot be banned; the chapter must transfer the presidency first'
        using errcode = '42501';
    end if;
    if v_role = 'executive' then
      raise exception 'make them a member before banning them' using errcode = '42501';
    end if;
    -- banned_by references fbla_profiles, and an owner may never have made a student profile (the console only
    -- needs a signed-in account): name them only when they have one. The audit row records the actor either way.
    insert into public.fbla_chapter_bans (chapter_id, user_id, banned_by, reason)
    values (p_chapter, p_user, (select p.id from public.fbla_profiles p where p.id = auth.uid()), v_reason)
    on conflict (chapter_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by;
    -- fbla_bans_after_insert removes the membership on a new ban; this also covers a re-ban.
    delete from public.fbla_chapter_members where chapter_id = p_chapter and user_id = p_user;
    perform public.fbla_notify(p_user, 'chapter_banned', 'You were banned from ' || v_name,
      coalesce('Reason: ' || v_reason, 'The site team banned you from the chapter.'), '/chapter',
      jsonb_build_object('chapter_id', p_chapter, 'reason', v_reason));
  else
    delete from public.fbla_chapter_bans where chapter_id = p_chapter and user_id = p_user;
    if not found then
      raise exception 'they are not banned from this chapter' using errcode = 'P0002';
    end if;
    perform public.fbla_notify(p_user, 'chapter_unbanned', 'Your ban from ' || v_name || ' was lifted',
      'You can join the chapter again with its code or an invite link.', '/chapter',
      jsonb_build_object('chapter_id', p_chapter));
  end if;

  perform set_config('fbla.via', '', true);
  perform set_config('fbla.reason', '', true);
  return jsonb_build_object('user_id', p_user, 'chapter_id', p_chapter, 'banned', p_banned);
end;
$$;

-- Change an executive, trainer or member role in any chapter, as the owner. Same rules as fbla_set_role.
create or replace function public.fbla_owner_set_chapter_role(
  p_user uuid, p_chapter uuid, p_role text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.fbla_role;
  v_new public.fbla_role;
  v_name text;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('executive', 'trainer', 'member') then
    raise exception 'use the transfer flow to change the president' using errcode = '22023';
  end if;
  select c.name into v_name from public.fbla_chapters c where c.id = p_chapter;
  if not found then
    raise exception 'chapter not found' using errcode = 'P0002';
  end if;

  select m.role into v_old from public.fbla_chapter_members m
   where m.chapter_id = p_chapter and m.user_id = p_user for update;
  if not found then
    raise exception 'they are not in this chapter' using errcode = 'P0002';
  end if;
  if v_old = 'president' then
    raise exception 'use the transfer flow to change the president' using errcode = '42501';
  end if;

  v_new := p_role::public.fbla_role;
  if v_old = v_new then
    return jsonb_build_object('user_id', p_user, 'chapter_id', p_chapter, 'role', v_new::text, 'changed', false);
  end if;

  perform set_config('fbla.via', 'owner_console', true);
  perform set_config('fbla.reason', coalesce(left(nullif(btrim(coalesce(p_reason, '')), ''), 200), ''), true);

  update public.fbla_chapter_members set role = v_new where chapter_id = p_chapter and user_id = p_user;
  if v_new = 'member' then
    delete from public.fbla_trainers where chapter_id = p_chapter and user_id = p_user;
  end if;

  perform public.fbla_notify(p_user, 'chapter_role',
    case v_new when 'executive' then 'You are now an executive'
               when 'trainer' then 'You are now a trainer'
               else 'Your chapter role changed' end,
    'Your role in ' || v_name || ' is now ' || initcap(v_new::text) || ' (was ' || initcap(v_old::text) || ').',
    '/chapter', jsonb_build_object('chapter_id', p_chapter, 'role', v_new, 'previous', v_old));

  perform set_config('fbla.via', '', true);
  perform set_config('fbla.reason', '', true);
  return jsonb_build_object('user_id', p_user, 'chapter_id', p_chapter, 'role', v_new::text, 'changed', true);
end;
$$;

revoke all on function public.fbla_owner_feedback_list(text, text, int, int) from public, anon;
revoke all on function public.fbla_owner_feedback_update(uuid, text, text, text) from public, anon;
revoke all on function public.fbla_owner_question(text) from public, anon;
revoke all on function public.fbla_owner_audit_search(int, text, text, int, int) from public, anon;
revoke all on function public.fbla_owner_user_search(text, int) from public, anon;
revoke all on function public.fbla_owner_support_email(uuid, text) from public, anon;
revoke all on function public.fbla_owner_set_chapter_ban(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.fbla_owner_set_chapter_role(uuid, uuid, text, text) from public, anon;
grant execute on function public.fbla_owner_feedback_list(text, text, int, int) to authenticated;
grant execute on function public.fbla_owner_feedback_update(uuid, text, text, text) to authenticated;
grant execute on function public.fbla_owner_question(text) to authenticated;
grant execute on function public.fbla_owner_audit_search(int, text, text, int, int) to authenticated;
grant execute on function public.fbla_owner_user_search(text, int) to authenticated;
grant execute on function public.fbla_owner_support_email(uuid, text) to authenticated;
grant execute on function public.fbla_owner_set_chapter_ban(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.fbla_owner_set_chapter_role(uuid, uuid, text, text) to authenticated;
