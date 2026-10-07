-- Private accounts and versioned workspaces for Madar.
-- Apply once with `supabase db push` or run this file in the project's SQL Editor.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.account_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint account_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint account_display_name_length check (char_length(display_name) between 1 and 80)
);

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;
alter table public.user_workspaces enable row level security;

-- Supabase projects can grant broad privileges by default. Remove those explicitly.
revoke all on public.account_profiles from public, anon, authenticated, service_role;
revoke all on public.user_workspaces from public, anon, authenticated, service_role;
grant usage on schema public to authenticated, service_role;
grant select on public.account_profiles to authenticated, service_role;
grant select on public.user_workspaces to authenticated;

drop policy if exists account_profiles_owner_read on public.account_profiles;
create policy account_profiles_owner_read on public.account_profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists user_workspaces_owner_read on public.user_workspaces;
create policy user_workspaces_owner_read on public.user_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function private.create_account_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display_name text;
begin
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  v_display_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', v_username));
  if char_length(v_display_name) not between 1 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  insert into public.account_profiles (id, username, display_name)
  values (new.id, v_username, v_display_name);
  return new;
end;
$$;

revoke all on function private.create_account_profile() from public, anon, authenticated;
drop trigger if exists madar_create_account_profile on auth.users;
create trigger madar_create_account_profile
  after insert on auth.users
  for each row execute function private.create_account_profile();

-- A SECURITY DEFINER function supplies the only write path. It derives the owner
-- from the verified auth token. The captured caller ID must also match, so a
-- request cannot write to a newly signed-in account after an account switch.
drop function if exists public.save_workspace(jsonb, bigint);
create or replace function public.save_workspace(
  p_payload jsonb,
  p_expected_revision bigint,
  p_user_id uuid
)
returns setof public.user_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved public.user_workspaces;
begin
  if v_user_id is null or v_user_id is distinct from p_user_id then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_revision' using errcode = '22023';
  end if;
  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or (p_payload -> 'version') is distinct from '1'::jsonb
    or jsonb_typeof(p_payload -> 'profile') is distinct from 'object'
    or jsonb_typeof(p_payload -> 'tasks') is distinct from 'array'
    or jsonb_typeof(p_payload -> 'skills') is distinct from 'array'
    or jsonb_typeof(p_payload -> 'entries') is distinct from 'array'
    or jsonb_typeof(p_payload -> 'events') is distinct from 'array'
    or octet_length(p_payload::text) > 5242880 then
    raise exception 'invalid_workspace' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.user_workspaces (user_id, payload, revision, updated_at)
    values (v_user_id, p_payload, 1, now())
    on conflict (user_id) do nothing
    returning * into v_saved;
  else
    update public.user_workspaces
    set payload = p_payload, revision = revision + 1, updated_at = now()
    where user_id = v_user_id and revision = p_expected_revision
    returning * into v_saved;
  end if;

  if not found then
    -- Retry only after reading/merging the latest row; never blindly overwrite it.
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;
  return next v_saved;
end;
$$;

revoke all on function public.save_workspace(jsonb, bigint, uuid) from public, anon, authenticated;
grant execute on function public.save_workspace(jsonb, bigint, uuid) to authenticated;

-- Hashes, not usernames or IP addresses, are stored for the login limiter. The
-- service-only RPC is public for PostgREST routing; its backing table is private.
create table if not exists private.username_login_limits (
  bucket text primary key,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
create index if not exists username_login_limits_expiry
  on private.username_login_limits (expires_at);
alter table private.username_login_limits enable row level security;
revoke all on private.username_login_limits from public, anon, authenticated, service_role;

create or replace function public.consume_username_login_limits(
  p_username_hash text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_username_attempts integer;
  v_ip_attempts integer;
begin
  if p_username_hash is null or p_username_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_rate_limit_key' using errcode = '22023';
  end if;

  delete from private.username_login_limits
  where expires_at < v_now - interval '1 hour';

  insert into private.username_login_limits (bucket, attempts, expires_at)
  values ('username:' || p_username_hash, 1, v_now + interval '15 minutes')
  on conflict (bucket) do update
    set attempts = case when username_login_limits.expires_at <= v_now then 1
      else least(username_login_limits.attempts + 1, 10000) end,
      expires_at = case when username_login_limits.expires_at <= v_now
        then v_now + interval '15 minutes' else username_login_limits.expires_at end
  returning attempts into v_username_attempts;

  insert into private.username_login_limits (bucket, attempts, expires_at)
  values ('ip:' || p_ip_hash, 1, v_now + interval '15 minutes')
  on conflict (bucket) do update
    set attempts = case when username_login_limits.expires_at <= v_now then 1
      else least(username_login_limits.attempts + 1, 10000) end,
      expires_at = case when username_login_limits.expires_at <= v_now
        then v_now + interval '15 minutes' else username_login_limits.expires_at end
  returning attempts into v_ip_attempts;

  return v_username_attempts <= 30 and v_ip_attempts <= 100;
end;
$$;

revoke all on function public.consume_username_login_limits(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_username_login_limits(text, text) to service_role;

commit;
