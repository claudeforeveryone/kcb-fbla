-- Project Omega: platform owner allowlist shared by the FBLA and DECA apps (same Supabase project, same auth).
-- Ownership is keyed on the immutable auth user id and granted only by a manual SQL insert after the
-- owner account is verified. No email-based or client-side elevation exists.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.platform_owners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  granted_at timestamptz not null default now()
);
revoke all on table private.platform_owners from public, anon, authenticated;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.platform_owners o where o.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

comment on table private.platform_owners is
  'Omega owner allowlist for FBLA + DECA. Grant: insert into private.platform_owners(user_id, note) select id, ''owner'' from auth.users where id = ''<verified uuid>''; Never key on email.';
