-- 0104 FBLA audit log (Omega owner console). Ledger name: fbla_0104_audit_log.
--
-- Append-only record of privileged changes. It is written two ways:
--   1. Triggers on the tables the privileged RPCs change, so every path is covered whichever RPC made the change
--      (existing chapter RPCs fbla_add_member, fbla_set_role, fbla_transfer_presidency, fbla_ban_member,
--      fbla_unban_member, fbla_remove_member, fbla_set_event_trainers, fbla_delete_chapter, and the owner wrappers in
--      0106):
--        member_added, chapter_role_changed, member_banned, member_unbanned, member_removed, trainer_assigned,
--        trainer_removed, chapter_deleted, owner_granted, owner_revoked.
--   2. Direct calls from the owner RPCs (0106): feedback_updated, support_email_viewed.
-- The owner RPCs set the transaction-local settings fbla.via ('owner_console') and fbla.reason, which the writer
-- folds into the row's detail, so a row says who acted (auth.uid(), null for direct SQL / cron), through which
-- console, and why. Clients cannot insert, update or delete; only platform owners can read (RLS + RPC).

create table if not exists public.fbla_audit_log (
  id bigint generated always as identity primary key,
  -- No foreign keys on purpose: an audit row must outlive the account or chapter it names.
  actor_id uuid,
  action text not null check (action ~ '^[a-z][a-z_]{2,63}$'),
  target_type text not null check (target_type ~ '^[a-z][a-z_]{1,39}$'),
  target_id text check (target_id is null or char_length(target_id) <= 80),
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 2048),
  created_at timestamptz not null default now()
);

comment on table public.fbla_audit_log is
  'Omega audit log (FBLA). Append-only (triggers block update/delete/truncate). Written by triggers and owner RPCs; read by platform owners only.';

create index if not exists fbla_audit_log_created_idx on public.fbla_audit_log (created_at desc);
create index if not exists fbla_audit_log_actor_idx on public.fbla_audit_log (actor_id, created_at desc);
create index if not exists fbla_audit_log_action_idx on public.fbla_audit_log (action, created_at desc);

alter table public.fbla_audit_log enable row level security;
revoke all on table public.fbla_audit_log from public, anon, authenticated;
grant select on table public.fbla_audit_log to authenticated;

drop policy if exists fbla_audit_log_owner_read on public.fbla_audit_log;
create policy fbla_audit_log_owner_read on public.fbla_audit_log
  for select to authenticated
  using ((select public.is_platform_owner()));

-- Append-only for everyone, including the table owner.
create or replace function fbla_private.fbla_audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'the audit log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists fbla_audit_log_no_change on public.fbla_audit_log;
create trigger fbla_audit_log_no_change
  before update or delete on public.fbla_audit_log
  for each row execute function fbla_private.fbla_audit_immutable();

drop trigger if exists fbla_audit_log_no_truncate on public.fbla_audit_log;
create trigger fbla_audit_log_no_truncate
  before truncate on public.fbla_audit_log
  for each statement execute function fbla_private.fbla_audit_immutable();

-- Writer. Never granted to clients.
create or replace function fbla_private.fbla_audit(
  p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_via text := nullif(current_setting('fbla.via', true), '');
  v_reason text := nullif(btrim(coalesce(current_setting('fbla.reason', true), '')), '');
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_via is not null and not v_detail ? 'via' then
    v_detail := v_detail || jsonb_build_object('via', left(v_via, 40));
  end if;
  if v_reason is not null and not v_detail ? 'reason' then
    v_detail := v_detail || jsonb_build_object('reason', left(v_reason, 200));
  end if;
  insert into public.fbla_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, nullif(left(p_target_id, 80), ''), v_detail);
end;
$$;

-- Role changes (fbla_set_role, fbla_transfer_presidency, trainer sync, owner wrapper).
create or replace function fbla_private.fbla_trg_audit_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fbla_private.fbla_audit('chapter_role_changed', 'chapter_member', new.user_id::text,
    jsonb_build_object('chapter_id', new.chapter_id, 'from', old.role::text, 'to', new.role::text));
  return new;
end;
$$;

drop trigger if exists fbla_audit_member_role on public.fbla_chapter_members;
create trigger fbla_audit_member_role
  after update of role on public.fbla_chapter_members
  for each row when (old.role is distinct from new.role)
  execute function fbla_private.fbla_trg_audit_member_role();

-- Additions by someone else (fbla_add_member puts a player in a chapter by username, with no consent step).
-- Skipped: joining on your own with a code or invite link, and the president row a new chapter makes for the person
-- who registered it (both have user_id = auth.uid()).
create or replace function fbla_private.fbla_trg_audit_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not distinct from auth.uid() then return new; end if;
  perform fbla_private.fbla_audit('member_added', 'chapter_member', new.user_id::text,
    jsonb_build_object('chapter_id', new.chapter_id, 'role', new.role::text));
  return new;
end;
$$;

drop trigger if exists fbla_audit_member_added on public.fbla_chapter_members;
create trigger fbla_audit_member_added
  after insert on public.fbla_chapter_members
  for each row execute function fbla_private.fbla_trg_audit_member_added();

-- Removals by someone else (fbla_remove_member, owner tools). Skipped: leaving on your own, the removal a ban makes
-- (the ban row says it), and cascades from a deleted chapter (chapter_deleted says it) or a deleted account.
create or replace function fbla_private.fbla_trg_audit_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is not distinct from auth.uid() then return old; end if;
  if not exists (select 1 from public.fbla_chapters c where c.id = old.chapter_id) then return old; end if;
  if not exists (select 1 from public.fbla_profiles p where p.id = old.user_id) then return old; end if;
  if exists (select 1 from public.fbla_chapter_bans b where b.chapter_id = old.chapter_id and b.user_id = old.user_id) then
    return old;
  end if;
  perform fbla_private.fbla_audit('member_removed', 'chapter_member', old.user_id::text,
    jsonb_build_object('chapter_id', old.chapter_id, 'role', old.role::text));
  return old;
end;
$$;

drop trigger if exists fbla_audit_member_removed on public.fbla_chapter_members;
create trigger fbla_audit_member_removed
  after delete on public.fbla_chapter_members
  for each row execute function fbla_private.fbla_trg_audit_member_removed();

-- Bans (new bans and re-bans that change the reason).
create or replace function fbla_private.fbla_trg_audit_ban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fbla_private.fbla_audit('member_banned', 'chapter_member', new.user_id::text,
    jsonb_build_object('chapter_id', new.chapter_id, 'op', lower(tg_op), 'has_reason', new.reason is not null));
  return new;
end;
$$;

drop trigger if exists fbla_audit_ban on public.fbla_chapter_bans;
create trigger fbla_audit_ban
  after insert or update on public.fbla_chapter_bans
  for each row execute function fbla_private.fbla_trg_audit_ban();

-- Unbans (not the cascade from a deleted chapter or account).
create or replace function fbla_private.fbla_trg_audit_unban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.fbla_chapters c where c.id = old.chapter_id) then return old; end if;
  if not exists (select 1 from public.fbla_profiles p where p.id = old.user_id) then return old; end if;
  perform fbla_private.fbla_audit('member_unbanned', 'chapter_member', old.user_id::text,
    jsonb_build_object('chapter_id', old.chapter_id));
  return old;
end;
$$;

drop trigger if exists fbla_audit_unban on public.fbla_chapter_bans;
create trigger fbla_audit_unban
  after delete on public.fbla_chapter_bans
  for each row execute function fbla_private.fbla_trg_audit_unban();

-- Trainer assignments and removals (per chapter and event); cascades from a deleted chapter are skipped.
create or replace function fbla_private.fbla_trg_audit_trainer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform fbla_private.fbla_audit('trainer_assigned', 'chapter_member', new.user_id::text,
      jsonb_build_object('chapter_id', new.chapter_id, 'event', new.event));
    return new;
  end if;
  if not exists (select 1 from public.fbla_chapters c where c.id = old.chapter_id) then return old; end if;
  perform fbla_private.fbla_audit('trainer_removed', 'chapter_member', old.user_id::text,
    jsonb_build_object('chapter_id', old.chapter_id, 'event', old.event));
  return old;
end;
$$;

drop trigger if exists fbla_audit_trainer on public.fbla_trainers;
create trigger fbla_audit_trainer
  after insert or delete on public.fbla_trainers
  for each row execute function fbla_private.fbla_trg_audit_trainer();

-- Chapter deletion (fbla_delete_chapter, or anything else that deletes a chapter row).
create or replace function fbla_private.fbla_trg_audit_chapter_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fbla_private.fbla_audit('chapter_deleted', 'chapter', old.id::text,
    jsonb_build_object('name', left(old.name, 80),
      'members', (select count(*) from public.fbla_chapter_members m where m.chapter_id = old.id)));
  return old;
end;
$$;

drop trigger if exists fbla_audit_chapter_delete on public.fbla_chapters;
create trigger fbla_audit_chapter_delete
  before delete on public.fbla_chapters
  for each row execute function fbla_private.fbla_trg_audit_chapter_delete();

-- Owner grants and revocations on the shared allowlist (FBLA and DECA). Grants happen by manual SQL, so the actor is
-- usually null; the row still proves when ownership changed. Moving a row to another account (an UPDATE of user_id)
-- logs the revocation and the grant.
create or replace function fbla_private.fbla_trg_audit_platform_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform fbla_private.fbla_audit('owner_granted', 'user', new.user_id::text, '{}'::jsonb);
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      perform fbla_private.fbla_audit('owner_revoked', 'user', old.user_id::text, jsonb_build_object('op', 'update'));
      perform fbla_private.fbla_audit('owner_granted', 'user', new.user_id::text, jsonb_build_object('op', 'update'));
    end if;
    return new;
  end if;
  perform fbla_private.fbla_audit('owner_revoked', 'user', old.user_id::text, '{}'::jsonb);
  return old;
end;
$$;

drop trigger if exists fbla_audit_platform_owner on private.platform_owners;
create trigger fbla_audit_platform_owner
  after insert or update or delete on private.platform_owners
  for each row execute function fbla_private.fbla_trg_audit_platform_owner();

revoke all on function fbla_private.fbla_audit_immutable() from public, anon, authenticated;
revoke all on function fbla_private.fbla_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_member_role() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_member_added() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_member_removed() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_ban() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_unban() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_trainer() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_chapter_delete() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_audit_platform_owner() from public, anon, authenticated;
