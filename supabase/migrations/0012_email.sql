-- 0012: notifications for every SPEC event, email config, the weekly digest schedule and newsletter emails.
--
-- Notification triggers are DEFERRED constraint triggers: they run at commit, after every statement in the
-- transaction (including any fbla_notify() calls other migrations make from RPCs). Each one skips a user who
-- already got a notification about the same thing in the same transaction, so if a feature RPC notifies on
-- its own, nobody gets two rows.
--
-- Email: edge functions weekly-digest / send-newsletter / email-unsubscribe (supabase/functions/*) call the
-- service-role-only RPCs below. Config lives in fbla_private.email_config (not exposed to clients) and the
-- shared function token lives in Vault (generated here, never in the repo). See docs/EMAIL.md.
--
-- Applied live as: fbla_0012_email_config, fbla_0012_email_notify_triggers, fbla_0012_email_rpcs_schedule,
-- fbla_0012_email_notify_dedupe, fbla_0012_email_site_url, fbla_0012_email_trainer_dedupe (this file is their concatenation, final versions).
-- A stray no-op record named fbla_0012_email (body: select 1) also exists in the migration history.

create extension if not exists pg_cron;

-- ================================================================ private config + log
create table if not exists fbla_private.email_config (
  key text primary key,
  value text not null
);
revoke all on fbla_private.email_config from public, anon, authenticated;
alter table fbla_private.email_config enable row level security;

insert into fbla_private.email_config (key, value) values
  ('site_url', 'https://kcb-fbla.vercel.app'),
  ('functions_url', 'https://uhgzeuvybyohdbfuhfil.supabase.co/functions/v1'),
  ('email_from', 'FBLC <onboarding@resend.dev>'),
  ('reply_to', '')
on conflict (key) do nothing;

create table if not exists fbla_private.email_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fbla_profiles (id) on delete cascade,
  kind text not null check (kind in ('digest', 'nudge', 'newsletter')),
  ref text not null,
  provider_id text,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists email_log_user_idx on fbla_private.email_log (user_id, sent_at desc);
revoke all on fbla_private.email_log from public, anon, authenticated;
alter table fbla_private.email_log enable row level security;

-- the token edge functions and pg_net calls share (random, generated in the database, only in Vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fbla_email_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fbla_email_token',
      'Shared token for KCB FBLA email edge functions (x-fbla-token header) and unsubscribe signatures');
  end if;
end $$;

create or replace function fbla_private.email_token()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'fbla_email_token' limit 1
$$;
revoke all on function fbla_private.email_token() from public, anon, authenticated;

create or replace function fbla_private.cfg(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select value from fbla_private.email_config where key = p_key
$$;
revoke all on function fbla_private.cfg(text) from public, anon, authenticated;

create or replace function fbla_private.unsub_sig(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(p_user::text, fbla_private.email_token(), 'sha256'), 'hex'), 32)
$$;
revoke all on function fbla_private.unsub_sig(uuid) from public, anon, authenticated;

-- POST to one of our edge functions through pg_net (async; sent after commit)
create or replace function fbla_private.invoke_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text := fbla_private.cfg('functions_url'); v_id bigint;
begin
  if v_url is null then return null; end if;
  select net.http_post(
    url := v_url || '/' || p_name,
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fbla-token', fbla_private.email_token()),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end $$;
revoke all on function fbla_private.invoke_function(text, jsonb) from public, anon, authenticated;

-- event slug -> display name (mirror of EVENTS in src/lib/types.ts)
create or replace function fbla_private.event_name(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
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
    else initcap(replace(coalesce(p, ''), '-', ' '))
  end
$$;

-- ================================================================ notification helpers
-- Notify unless this user already got a notification about the same thing in this transaction
-- (same kind family AND mentioning the same entity id). Achievements never count as duplicates.
create or replace function fbla_private.notify_once(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_data jsonb, p_entity text,
  p_families text[]
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or not exists (select 1 from public.fbla_profiles where id = p_user) then return; end if;
  if exists (
    select 1 from public.fbla_notifications n
    where n.user_id = p_user and n.created_at = now() and n.kind <> 'achievement'
      and (n.kind = p_kind or split_part(n.kind, '_', 1) = any (p_families))
      and (p_entity is null or n.data::text like '%' || p_entity || '%' or coalesce(n.link, '') like '%' || p_entity || '%')
  ) then return; end if;
  perform public.fbla_notify(p_user, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb));
end $$;
revoke all on function fbla_private.notify_once(uuid, text, text, text, text, jsonb, text, text[]) from public, anon, authenticated;

create or replace function fbla_private.who(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.fbla_profiles where id = p_user), 'Someone')
$$;

create or replace function fbla_private.excerpt(p text, n int default 140)
returns text language sql immutable set search_path = '' as $$
  select case when p is null or btrim(p) = '' then null
    else case when char_length(x) > n then rtrim(left(x, n - 1)) || '…' else x end end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '[*_#>`\[\]]', '', 'g'), '\s+', ' ', 'g') as x) s
$$;

-- ================================================================ duels
create or replace function fbla_private.trg_duel_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event text := fbla_private.event_name(new.event);
  v_link text := '/arena/' || new.id;
  v_data jsonb := jsonb_build_object('duel_id', new.id, 'event', new.event);
  v_fam text[] := array['duel', 'arena', 'challenge'];
  c_score int; o_score int;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform fbla_private.notify_once(new.opponent_id, 'duel_challenge',
        fbla_private.who(new.challenger_id) || ' challenged you to a duel',
        v_event || ' · ' || cardinality(new.question_ids) || ' questions. Accept within 24 hours.',
        v_link, v_data || jsonb_build_object('user_id', new.challenger_id), new.id::text, v_fam);
    end if;
    return null;
  end if;

  if old.status is not distinct from new.status then return null; end if;

  if new.status = 'accepted' then
    perform fbla_private.notify_once(new.challenger_id, 'duel_accepted',
      fbla_private.who(new.opponent_id) || ' accepted your challenge',
      v_event || ' duel is on. Play your round when you are ready.',
      v_link, v_data || jsonb_build_object('user_id', new.opponent_id), new.id::text, v_fam);
  elsif new.status = 'declined' then
    perform fbla_private.notify_once(new.challenger_id, 'duel_declined',
      fbla_private.who(new.opponent_id) || ' declined your challenge',
      v_event || '. Try someone else in the Arena.',
      '/arena', v_data || jsonb_build_object('user_id', new.opponent_id), new.id::text, v_fam);
  elsif new.status = 'complete' then
    c_score := coalesce(new.challenger_score, 0);
    o_score := coalesce(new.opponent_score, 0);
    -- challenger's view
    perform fbla_private.notify_once(new.challenger_id, 'duel_result',
      case when new.winner_id = new.challenger_id then 'You beat ' || fbla_private.who(new.opponent_id)
           when new.winner_id = new.opponent_id then fbla_private.who(new.opponent_id) || ' won your duel'
           else 'Draw with ' || fbla_private.who(new.opponent_id) end,
      v_event || ' · ' || c_score || '-' || o_score,
      v_link, v_data || jsonb_build_object('user_id', new.opponent_id,
        'outcome', case when new.winner_id = new.challenger_id then 'win' when new.winner_id is null then 'draw' else 'loss' end),
      new.id::text, v_fam);
    -- opponent's view
    perform fbla_private.notify_once(new.opponent_id, 'duel_result',
      case when new.winner_id = new.opponent_id then 'You beat ' || fbla_private.who(new.challenger_id)
           when new.winner_id = new.challenger_id then fbla_private.who(new.challenger_id) || ' won your duel'
           else 'Draw with ' || fbla_private.who(new.challenger_id) end,
      v_event || ' · ' || o_score || '-' || c_score,
      v_link, v_data || jsonb_build_object('user_id', new.challenger_id,
        'outcome', case when new.winner_id = new.opponent_id then 'win' when new.winner_id is null then 'draw' else 'loss' end),
      new.id::text, v_fam);
  end if;
  return null;
end $$;

create constraint trigger zz_fbla_duels_notify_ins after insert on public.fbla_duels
  deferrable initially deferred for each row execute function fbla_private.trg_duel_notify();
create constraint trigger zz_fbla_duels_notify_upd after update on public.fbla_duels
  deferrable initially deferred for each row
  when (old.status is distinct from new.status)
  execute function fbla_private.trg_duel_notify();

-- ================================================================ friends
create or replace function fbla_private.trg_friend_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fam text[] := array['friend', 'social'];
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform fbla_private.notify_once(new.friend_id, 'friend_request',
      fbla_private.who(new.user_id) || ' sent you a friend request',
      'Friends can challenge each other and compare stats.',
      coalesce('/u/' || (select username from public.fbla_profiles where id = new.user_id), '/arena'),
      jsonb_build_object('user_id', new.user_id), new.user_id::text, v_fam);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform fbla_private.notify_once(new.user_id, 'friend_accepted',
      fbla_private.who(new.friend_id) || ' accepted your friend request',
      'Challenge them in the Arena.',
      coalesce('/u/' || (select username from public.fbla_profiles where id = new.friend_id), '/arena'),
      jsonb_build_object('user_id', new.friend_id), new.friend_id::text, v_fam);
  end if;
  return null;
end $$;

create constraint trigger zz_fbla_friends_notify after insert or update on public.fbla_friends
  deferrable initially deferred for each row execute function fbla_private.trg_friend_notify();

-- ================================================================ chapter: role change, trainer, removal, ban
create or replace function fbla_private.trg_member_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chapter text;
  v_fam text[] := array['role', 'chapter', 'member', 'trainer', 'president', 'promoted', 'demoted'];
  v_label text;
begin
  if tg_op = 'UPDATE' then
    if old.role = new.role or new.user_id = (select auth.uid()) then return null; end if;
    select name into v_chapter from public.fbla_chapters where id = new.chapter_id;
    v_label := case new.role::text when 'president' then 'President' when 'executive' then 'Executive'
      when 'trainer' then 'Trainer' else 'Member' end;
    perform fbla_private.notify_once(new.user_id, 'role_change',
      case when new.role::text = 'president' then 'You are now president of ' || coalesce(v_chapter, 'your chapter')
           else 'Your role in ' || coalesce(v_chapter, 'your chapter') || ' is now ' || v_label end,
      case new.role::text
        when 'president' then 'You can manage everything, including transferring the presidency.'
        when 'executive' then 'You can now manage members, attendance, posts, tests and assignments.'
        when 'trainer' then 'You can post, build tests and decks, and assign work for your events.'
        else 'You keep full access to the classroom and assignments.' end,
      case when new.role::text in ('president', 'executive') then '/chapter/admin' else '/chapter' end,
      jsonb_build_object('chapter_id', new.chapter_id, 'role', new.role, 'previous_role', old.role),
      new.chapter_id::text, v_fam);
  elsif tg_op = 'DELETE' then
    -- leaving on your own, the chapter being deleted, or the account being deleted: no notification
    if old.user_id = (select auth.uid()) then return null; end if;
    select name into v_chapter from public.fbla_chapters where id = old.chapter_id;
    if v_chapter is null then return null; end if;
    if exists (select 1 from public.fbla_chapter_members where user_id = old.user_id and chapter_id = old.chapter_id) then
      return null;
    end if;
    perform fbla_private.notify_once(old.user_id, 'chapter_removed',
      'You were removed from ' || v_chapter,
      'You can join another chapter with a code or invite link.',
      '/chapter', jsonb_build_object('chapter_id', old.chapter_id), old.chapter_id::text,
      array['chapter', 'removed', 'ban', 'banned', 'kicked']);
  end if;
  return null;
end $$;

create constraint trigger zz_fbla_members_notify after update or delete on public.fbla_chapter_members
  deferrable initially deferred for each row execute function fbla_private.trg_member_notify();

create or replace function fbla_private.trg_trainer_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_chapter text;
begin
  if new.user_id = (select auth.uid()) then return null; end if;
  select name into v_chapter from public.fbla_chapters where id = new.chapter_id;
  perform fbla_private.notify_once(new.user_id, 'trainer_assigned',
    'You are now a ' || fbla_private.event_name(new.event) || ' trainer',
    coalesce(v_chapter, 'Your chapter') || ' picked you to lead ' || fbla_private.event_name(new.event)
      || '. You can post, build tests and decks, and assign work for it.',
    '/chapter/classroom', jsonb_build_object('chapter_id', new.chapter_id, 'event', new.event),
    new.event, array['trainer', 'chapter', 'role']);
  return null;
end $$;

create constraint trigger zz_fbla_trainers_notify after insert on public.fbla_trainers
  deferrable initially deferred for each row execute function fbla_private.trg_trainer_notify();

create or replace function fbla_private.trg_ban_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_chapter text;
begin
  select name into v_chapter from public.fbla_chapters where id = new.chapter_id;
  if v_chapter is null then return null; end if;
  perform fbla_private.notify_once(new.user_id, 'chapter_banned',
    'You were banned from ' || v_chapter,
    coalesce('Reason: ' || nullif(btrim(new.reason), ''), 'An executive removed you and blocked rejoining.'),
    '/chapter', jsonb_build_object('chapter_id', new.chapter_id), new.chapter_id::text,
    array['ban', 'banned', 'removed', 'kicked']);
  return null;
end $$;

create constraint trigger zz_fbla_bans_notify after insert on public.fbla_chapter_bans
  deferrable initially deferred for each row execute function fbla_private.trg_ban_notify();

-- ================================================================ classroom: announcements, newsletters, assignments
create or replace function fbla_private.trg_post_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_author text := fbla_private.who(new.author_id);
  v_kind text := case new.kind when 'newsletter' then 'newsletter' else 'announcement' end;
begin
  if new.kind not in ('announcement', 'newsletter') then return null; end if;
  if not exists (select 1 from public.fbla_posts where id = new.id) then return null; end if;
  for m in select user_id from public.fbla_chapter_members
           where chapter_id = new.chapter_id and user_id is distinct from new.author_id loop
    perform fbla_private.notify_once(m.user_id, v_kind,
      case v_kind when 'newsletter' then 'Newsletter: ' else 'Announcement: ' end || new.title,
      v_author || coalesce(' · ' || fbla_private.excerpt(new.body, 120), ''),
      '/chapter/classroom',
      jsonb_build_object('post_id', new.id, 'chapter_id', new.chapter_id, 'user_id', new.author_id),
      new.id::text, array['post', 'announcement', 'newsletter', 'classroom']);
  end loop;
  return null;
end $$;

create constraint trigger zz_fbla_posts_notify after insert on public.fbla_posts
  deferrable initially deferred for each row execute function fbla_private.trg_post_notify();

-- newsletters are also emailed (send-newsletter edge function, via pg_net after commit)
create or replace function fbla_private.trg_post_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'newsletter' then
    perform fbla_private.invoke_function('send-newsletter', jsonb_build_object('post_id', new.id));
  end if;
  return null;
end $$;

create trigger zz_fbla_posts_email after insert on public.fbla_posts
  for each row when (new.kind = 'newsletter') execute function fbla_private.trg_post_email();

create or replace function fbla_private.trg_assignment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record; v_due text;
begin
  if not exists (select 1 from public.fbla_assignments where id = new.id) then return null; end if;
  v_due := case when new.due_at is null then 'No due date'
    else 'Due ' || to_char(new.due_at at time zone 'America/Toronto', 'Dy, Mon FMDD "at" FMHH12:MI AM') end;
  for m in select user_id from public.fbla_chapter_members
           where chapter_id = new.chapter_id and user_id is distinct from new.assigned_by loop
    perform fbla_private.notify_once(m.user_id, 'assignment',
      'New assignment: ' || new.title,
      v_due || coalesce(' · ' || fbla_private.event_name(new.event), '') || ' · from ' || fbla_private.who(new.assigned_by),
      '/chapter/classroom',
      jsonb_build_object('assignment_id', new.id, 'chapter_id', new.chapter_id, 'due_at', new.due_at, 'event', new.event),
      new.id::text, array['assignment', 'assigned', 'classroom']);
  end loop;
  return null;
end $$;

create constraint trigger zz_fbla_assignments_notify after insert on public.fbla_assignments
  deferrable initially deferred for each row execute function fbla_private.trg_assignment_notify();

-- the trigger functions are only called by triggers
revoke all on function fbla_private.trg_duel_notify(), fbla_private.trg_friend_notify(),
  fbla_private.trg_member_notify(), fbla_private.trg_trainer_notify(), fbla_private.trg_ban_notify(),
  fbla_private.trg_post_notify(), fbla_private.trg_post_email(), fbla_private.trg_assignment_notify(),
  fbla_private.who(uuid)
  from public, anon, authenticated;

-- ================================================================ service-role RPCs for the edge functions
-- config + token check in one call. Returns null config unless the token matches.
create or replace function public.fbla_email_config(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_token text := fbla_private.email_token();
begin
  if v_token is null or p_token is null or p_token <> v_token then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true,
    'site_url', rtrim(fbla_private.cfg('site_url'), '/'),
    'functions_url', rtrim(fbla_private.cfg('functions_url'), '/'),
    'email_from', fbla_private.cfg('email_from'),
    'reply_to', nullif(fbla_private.cfg('reply_to'), ''),
    'week', to_char(now() at time zone 'America/Toronto', 'IYYY-"W"IW'));
end $$;

-- everything the weekly digest needs, one object per recipient who has not had this week's email yet
create or replace function public.fbla_email_digest_recipients(p_week text, p_user uuid default null, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Toronto')::date; v jsonb;
begin
  select coalesce(jsonb_agg(r order by r->>'display_name'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'user_id', p.id,
      'email', u.email,
      'display_name', p.display_name,
      'username', p.username,
      'idle', (p.last_active_date is null or p.last_active_date < v_today - 7),
      'days_idle', case when p.last_active_date is null then null else v_today - p.last_active_date end,
      'never_played', p.questions_answered = 0,
      'elo', p.elo,
      'peak_elo', p.peak_elo,
      'rank', (select count(*) + 1 from public.fbla_profiles x where x.elo > p.elo),
      'current_streak', case when p.last_active_date >= v_today - 1 then p.current_streak else 0 end,
      'best_streak', p.best_streak,
      'main_event', p.main_event,
      'main_event_name', case when p.main_event is null then null else fbla_private.event_name(p.main_event) end,
      'chapter_name', (select name from public.fbla_chapters c where c.id = p.chapter_id),
      'unread', (select count(*) from public.fbla_notifications n where n.user_id = p.id and n.read_at is null),
      'week', (
        select jsonb_build_object(
          'questions', count(*),
          'correct', count(*) filter (where a.correct),
          'elo_change', coalesce(sum(a.elo_delta), 0),
          'days_active', count(distinct (a.created_at at time zone 'America/Toronto')::date),
          'top_event', (
            select fbla_private.event_name(a2.event) from public.fbla_answers a2
            where a2.user_id = p.id and a2.created_at >= now() - interval '7 days'
            group by a2.event order by count(*) desc limit 1))
        from public.fbla_answers a where a.user_id = p.id and a.created_at >= now() - interval '7 days'),
      'duels', (
        select jsonb_build_object(
          'won', count(*) filter (where d.winner_id = p.id),
          'played', count(*))
        from public.fbla_duels d
        where d.status = 'complete' and d.completed_at >= now() - interval '7 days'
          and (d.challenger_id = p.id or d.opponent_id = p.id)),
      'pending_duels', (
        select count(*) from public.fbla_duels d
        where d.opponent_id = p.id and d.status = 'pending' and d.expires_at > now()),
      'focus', (
        select jsonb_build_object('event', fbla_private.event_name(w.event), 'event_slug', w.event, 'sub', w.sub,
          'accuracy', round(100.0 * w.c / w.n))
        from (select a.event, a.sub, count(*) n, count(*) filter (where a.correct) c
              from public.fbla_answers a where a.user_id = p.id and a.sub is not null
              group by a.event, a.sub having count(*) >= 5) w
        order by w.c::numeric / w.n, w.n desc limit 1),
      'assignments', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind,
          'event', case when s.event is null then null else fbla_private.event_name(s.event) end,
          'due_at', s.due_at,
          'due_label', case when s.due_at is null then 'No due date'
            else to_char(s.due_at at time zone 'America/Toronto', 'Dy, Mon FMDD') end,
          'due_soon', s.due_at is not null and s.due_at < now() + interval '3 days')
          order by s.due_at nulls last), '[]'::jsonb)
        from (select a.* from public.fbla_assignments a
              where p.chapter_id is not null and a.chapter_id = p.chapter_id
                and (a.due_at is null or a.due_at > now())
                and not exists (select 1 from public.fbla_attempts t where t.user_id = p.id and t.assignment_id = a.id)
              order by a.due_at nulls last limit 5) s),
      'newsletter', (
        select jsonb_build_object('id', po.id, 'title', po.title, 'excerpt', fbla_private.excerpt(po.body, 260),
          'author', fbla_private.who(po.author_id), 'created_at', po.created_at)
        from public.fbla_posts po
        where p.chapter_id is not null and po.chapter_id = p.chapter_id and po.kind = 'newsletter'
          and po.created_at >= now() - interval '14 days'
        order by po.created_at desc limit 1),
      'unsub_sig', fbla_private.unsub_sig(p.id)
    ) as r
    from public.fbla_profiles p
    join auth.users u on u.id = p.id
    where p.email_opt_in
      and u.email is not null and u.email_confirmed_at is not null
      and (p_user is null or p.id = p_user)
      and (p_user is not null or p.created_at < now() - interval '2 days')
      and not exists (select 1 from fbla_private.email_log l
                      where l.user_id = p.id and l.ref = p_week and l.kind in ('digest', 'nudge'))
      -- idle members get at most 4 nudges in a row, then we stop until they come back
      and (p_user is not null
        or (p.last_active_date is not null and p.last_active_date >= v_today - 7)
        or (select count(*) from fbla_private.email_log l
            where l.user_id = p.id and l.kind = 'nudge'
              and l.sent_at > coalesce(p.last_active_date::timestamptz, p.created_at)) < 4)
    order by p.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ) q;
  return v;
end $$;

-- newsletter + its recipients (members who opted in and have not had this one yet)
create or replace function public.fbla_email_newsletter(p_post uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare po public.fbla_posts; v jsonb;
begin
  select * into po from public.fbla_posts where id = p_post;
  if not found or po.kind <> 'newsletter' then return null; end if;
  select jsonb_build_object(
    'post', jsonb_build_object('id', po.id, 'title', po.title, 'body', po.body, 'url', po.url,
      'event', case when po.event is null then null else fbla_private.event_name(po.event) end,
      'created_at', po.created_at),
    'author', (select jsonb_build_object('display_name', a.display_name, 'username', a.username,
      'role', (select role from public.fbla_chapter_members m where m.user_id = a.id and m.chapter_id = po.chapter_id))
      from public.fbla_profiles a where a.id = po.author_id),
    'chapter', (select jsonb_build_object('id', c.id, 'name', c.name, 'school', c.school)
      from public.fbla_chapters c where c.id = po.chapter_id),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.id, 'email', u.email, 'display_name', p.display_name,
        'unsub_sig', fbla_private.unsub_sig(p.id)))
      from public.fbla_chapter_members m
      join public.fbla_profiles p on p.id = m.user_id
      join auth.users u on u.id = p.id
      where m.chapter_id = po.chapter_id and p.email_opt_in
        and u.email is not null and u.email_confirmed_at is not null
        and not exists (select 1 from fbla_private.email_log l
                        where l.user_id = p.id and l.kind = 'newsletter' and l.ref = po.id::text)), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- record sends (idempotent)
create or replace function public.fbla_email_log_sent(p_kind text, p_ref text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into fbla_private.email_log (user_id, kind, ref, provider_id)
  select (x->>'user_id')::uuid, p_kind, p_ref, x->>'provider_id'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  where exists (select 1 from public.fbla_profiles where id = (x->>'user_id')::uuid)
  on conflict (user_id, kind, ref) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- site URL for the unsubscribe redirect (that function has no token, only a signed link)
create or replace function public.fbla_email_site_url()
returns text language sql stable security definer set search_path = '' as $
  select rtrim(fbla_private.cfg('site_url'), '/')
$;
revoke all on function public.fbla_email_site_url() from public, anon, authenticated;
grant execute on function public.fbla_email_site_url() to service_role;

-- one-click unsubscribe (signature from the email link)
create or replace function public.fbla_email_unsubscribe(p_user uuid, p_sig text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_sig is null or p_sig <> fbla_private.unsub_sig(p_user) then return false; end if;
  update public.fbla_profiles set email_opt_in = false where id = p_user;
  return found;
end $$;

revoke all on function public.fbla_email_config(text), public.fbla_email_digest_recipients(text, uuid, int),
  public.fbla_email_newsletter(uuid), public.fbla_email_log_sent(text, text, jsonb),
  public.fbla_email_unsubscribe(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fbla_email_config(text), public.fbla_email_digest_recipients(text, uuid, int),
  public.fbla_email_newsletter(uuid), public.fbla_email_log_sent(text, text, jsonb),
  public.fbla_email_unsubscribe(uuid, text)
  to service_role;

-- ================================================================ client RPC: mark many read at once
create or replace function public.fbla_mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.fbla_notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fbla_mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.fbla_mark_notifications_read(uuid[]) to authenticated;

-- ================================================================ schedule: Mondays 13:00 UTC
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fbla-weekly-digest') then
    perform cron.unschedule('fbla-weekly-digest');
  end if;
  perform cron.schedule('fbla-weekly-digest', '0 13 * * 1',
    $job$select fbla_private.invoke_function('weekly-digest', '{"source":"cron"}'::jsonb)$job$);
end $$;
