-- Account administration is authorized by server-owned roles, never Auth metadata.
-- Apply after 202610060001_cloud_accounts.sql. This migration grants no admin role.
begin;

alter table public.account_profiles
  add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended'));

create table if not exists private.account_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Deliberately no actor/target foreign keys: audit history survives Auth deletion.
create table if not exists private.account_admin_operations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_username text not null,
  target_id uuid not null,
  target_username text not null,
  action text not null check (action in ('activate', 'suspend', 'delete')),
  state text not null check (state in ('pending', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists account_admin_one_pending_action
  on private.account_admin_operations (target_id) where state = 'pending';
create index if not exists account_admin_operations_created
  on private.account_admin_operations (created_at desc, id);

alter table private.account_admins enable row level security;
alter table private.account_admin_operations enable row level security;
revoke all on private.account_admins from public, anon, authenticated, service_role;
revoke all on private.account_admin_operations from public, anon, authenticated, service_role;

create or replace function private.current_account_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_profiles
    where id = (select auth.uid()) and status = 'active'
  )
$$;
revoke all on function private.current_account_is_active()
  from public, anon, authenticated, service_role;
-- Policies resolve the function by OID; clients still have no private schema usage.
grant execute on function private.current_account_is_active() to authenticated;

drop policy if exists user_workspaces_owner_read on public.user_workspaces;
create policy user_workspaces_owner_read on public.user_workspaces
  for select to authenticated using (
    (select auth.uid()) = user_id and (select private.current_account_is_active())
  );

create or replace function public.get_account_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
  v_status text;
begin
  if v_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select status into v_status from public.account_profiles where id = v_id;
  return jsonb_build_object(
    'role', case when exists (select 1 from private.account_admins where user_id = v_id)
      then 'admin' else 'user' end,
    'status', coalesce(v_status, 'deleted')
  );
end;
$$;
revoke all on function public.get_account_access() from public, anon, authenticated, service_role;
grant execute on function public.get_account_access() to authenticated;

-- Holding a profile SHARE lock makes a completed suspension a strict write barrier.
-- A write that already began may finish first; subsequent old-token writes are denied.
create or replace function public.save_workspace(
  p_payload jsonb, p_expected_revision bigint, p_user_id uuid
)
returns setof public.user_workspaces language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved public.user_workspaces;
  v_status text;
begin
  if v_user_id is null or v_user_id is distinct from p_user_id then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select status into v_status from public.account_profiles where id = v_user_id for share;
  if not found then
    raise exception 'account_deleted' using errcode = '42501';
  elsif v_status <> 'active' then
    raise exception 'account_suspended' using errcode = '42501';
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
    on conflict (user_id) do nothing returning * into v_saved;
  else
    update public.user_workspaces
    set payload = p_payload, revision = revision + 1, updated_at = now()
    where user_id = v_user_id and revision = p_expected_revision
    returning * into v_saved;
  end if;
  if not found then
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;
  return next v_saved;
end;
$$;
revoke all on function public.save_workspace(jsonb, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_workspace(jsonb, bigint, uuid) to authenticated;

-- The Edge Function verifies the bearer token, then supplies that verified user ID.
-- Actor profile locks prevent concurrent role revocation/suspension during an RPC.
create or replace function private.require_account_admin(p_actor_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_username text;
begin
  select p.username into v_username from public.account_profiles p
    join private.account_admins a on a.user_id = p.id
    where p.id = p_actor_id and p.status = 'active' for share of p, a;
  if not found then raise exception 'admin_required' using errcode = '42501'; end if;
  return v_username;
end;
$$;

create or replace function private.lock_manageable_account(p_target_id uuid)
returns public.account_profiles language plpgsql security definer set search_path = ''
as $$
declare v_target public.account_profiles;
begin
  -- Reject known administrators before taking an UPDATE lock, so opposing
  -- administrators attempting protected actions cannot deadlock each other.
  if exists (select 1 from private.account_admins where user_id = p_target_id) then
    raise exception 'protected_admin' using errcode = '42501';
  end if;
  select * into v_target from public.account_profiles where id = p_target_id for update;
  if not found then raise exception 'account_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from private.account_admins where user_id = p_target_id) then
    raise exception 'protected_admin' using errcode = '42501';
  end if;
  -- Auth calls have short request timeouts. A crashed status request can be retried
  -- after fifteen minutes without leaving an account permanently locked. A late
  -- completion of the expired operation cannot change database access.
  update private.account_admin_operations
    set state = 'failed', error_code = 'operation_expired', completed_at = clock_timestamp()
    where target_id = p_target_id and state = 'pending' and action <> 'delete'
      and created_at < clock_timestamp() - interval '15 minutes';
  -- An uncertain remote Auth deletion cannot be cancelled by a local timeout.
  -- It requires operator reconciliation and must never expire into a reactivation.
  return v_target;
end;
$$;
revoke all on function private.require_account_admin(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_manageable_account(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_list_accounts(
  p_actor_id uuid, p_search text default '', p_status text default 'all',
  p_page integer default 1, p_page_size integer default 20
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_total bigint;
  v_accounts jsonb;
  v_stats jsonb;
begin
  perform private.require_account_admin(p_actor_id);
  if char_length(v_search) > 100 then
    raise exception 'invalid_search' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('all', 'active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 1000000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;
  select jsonb_build_object('total', count(*),
    'active', count(*) filter (where p.status = 'active'),
    'suspended', count(*) filter (where p.status = 'suspended'),
    'admins', count(*) filter (where a.user_id is not null)) into v_stats
  from public.account_profiles p left join private.account_admins a on a.user_id = p.id;

  select count(*) into v_total from public.account_profiles p
    join auth.users u on u.id = p.id
  where (p_status = 'all' or p.status = p_status)
    and (v_search = '' or strpos(lower(p.username), lower(v_search)) > 0
      or strpos(lower(p.display_name), lower(v_search)) > 0
      or strpos(lower(coalesce(u.email, '')), lower(v_search)) > 0);

  select coalesce(jsonb_agg(accounts.account order by accounts.created_at desc, accounts.id), '[]'::jsonb)
    into v_accounts from (
      select p.id, p.created_at, jsonb_build_object(
        'id', p.id, 'username', p.username, 'displayName', p.display_name,
        'email', coalesce(u.email, ''), 'status', p.status,
        'role', case when a.user_id is not null then 'admin' else 'user' end,
        'createdAt', p.created_at, 'lastSignInAt', u.last_sign_in_at,
        'emailConfirmed', u.email_confirmed_at is not null
      ) as account
      from public.account_profiles p join auth.users u on u.id = p.id
      left join private.account_admins a on a.user_id = p.id
      where (p_status = 'all' or p.status = p_status)
        and (v_search = '' or strpos(lower(p.username), lower(v_search)) > 0
          or strpos(lower(p.display_name), lower(v_search)) > 0
          or strpos(lower(coalesce(u.email, '')), lower(v_search)) > 0)
      order by p.created_at desc, p.id
      limit p_page_size offset (p_page::bigint - 1) * p_page_size
    ) accounts;
  return jsonb_build_object('accounts', v_accounts, 'total', v_total,
    'page', p_page, 'pageSize', p_page_size, 'stats', v_stats);
end;
$$;

create or replace function public.admin_check_account_target(p_actor_id uuid, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_target public.account_profiles;
begin
  perform private.require_account_admin(p_actor_id);
  v_target := private.lock_manageable_account(p_target_id);
  if exists (select 1 from private.account_admin_operations
    where target_id = p_target_id and state = 'pending') then
    raise exception 'account_action_in_progress' using errcode = '40001';
  end if;
  return jsonb_build_object('id', v_target.id, 'username', v_target.username, 'status', v_target.status);
end;
$$;

-- A direct SQL-only operation is useful for emergency administration. The normal
-- Edge API uses begin/complete below to serialize DB updates with Auth ban/unban.
create or replace function public.admin_set_account_status(
  p_actor_id uuid, p_target_id uuid, p_status text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor text; v_target public.account_profiles;
begin
  v_actor := private.require_account_admin(p_actor_id);
  v_target := private.lock_manageable_account(p_target_id);
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if exists (select 1 from private.account_admin_operations
    where target_id = p_target_id and state = 'pending') then
    raise exception 'account_action_in_progress' using errcode = '40001';
  end if;
  if v_target.status <> p_status then
    update public.account_profiles set status = p_status where id = p_target_id;
    insert into private.account_admin_operations
      (actor_id, actor_username, target_id, target_username, action, state, completed_at)
    values (p_actor_id, v_actor, p_target_id, v_target.username,
      case when p_status = 'active' then 'activate' else 'suspend' end, 'completed', now());
  end if;
  return jsonb_build_object('id', p_target_id, 'username', v_target.username, 'status', p_status);
end;
$$;

create or replace function public.admin_begin_account_status(
  p_actor_id uuid, p_target_id uuid, p_status text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor text; v_target public.account_profiles; v_operation_id uuid;
begin
  v_actor := private.require_account_admin(p_actor_id);
  v_target := private.lock_manageable_account(p_target_id);
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if exists (select 1 from private.account_admin_operations
    where target_id = p_target_id and state = 'pending') then
    raise exception 'account_action_in_progress' using errcode = '40001';
  end if;
  -- Both directions deny old-token access until Auth confirms the intended state.
  update public.account_profiles set status = 'suspended' where id = p_target_id;
  insert into private.account_admin_operations
    (actor_id, actor_username, target_id, target_username, action, state)
  values (p_actor_id, v_actor, p_target_id, v_target.username,
    case when p_status = 'active' then 'activate' else 'suspend' end, 'pending')
  returning id into v_operation_id;
  return jsonb_build_object('operationId', v_operation_id, 'targetId', p_target_id,
    'username', v_target.username, 'status', p_status);
end;
$$;

create or replace function public.admin_complete_account_status(p_actor_id uuid, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_operation private.account_admin_operations; v_status text;
begin
  perform private.require_account_admin(p_actor_id);
  select * into v_operation from private.account_admin_operations
    where id = p_operation_id and actor_id = p_actor_id and action in ('activate', 'suspend');
  if not found then raise exception 'operation_not_found' using errcode = 'P0002'; end if;
  -- Every status operation locks the target before its audit row to avoid an
  -- expiry/retry transaction deadlocking with a completion transaction.
  perform private.lock_manageable_account(v_operation.target_id);
  select * into v_operation from private.account_admin_operations where id = p_operation_id for update;
  v_status := case when v_operation.action = 'activate' then 'active' else 'suspended' end;
  if v_operation.state = 'failed' then
    raise exception 'operation_failed' using errcode = '40001';
  elsif v_operation.state = 'pending' then
    update public.account_profiles set status = v_status where id = v_operation.target_id;
    update private.account_admin_operations set state = 'completed', completed_at = now()
      where id = p_operation_id;
  end if;
  return jsonb_build_object('operationId', v_operation.id,
    'targetId', v_operation.target_id, 'username', v_operation.target_username, 'status', v_status);
end;
$$;

create or replace function public.admin_fail_account_status(
  p_actor_id uuid, p_operation_id uuid, p_error_code text default 'status_update_failed'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_operation private.account_admin_operations;
begin
  perform private.require_account_admin(p_actor_id);
  select * into v_operation from private.account_admin_operations
    where id = p_operation_id and actor_id = p_actor_id and action in ('activate', 'suspend');
  if not found then raise exception 'operation_not_found' using errcode = 'P0002'; end if;
  perform private.lock_manageable_account(v_operation.target_id);
  select * into v_operation from private.account_admin_operations where id = p_operation_id for update;
  if v_operation.state = 'completed' then
    raise exception 'operation_completed' using errcode = '40001';
  elsif v_operation.state = 'failed' then
    -- A timed-out older request must never re-suspend a newly restored account.
    return jsonb_build_object('operationId', v_operation.id,
      'targetId', v_operation.target_id, 'status', 'failed');
  end if;
  update public.account_profiles set status = 'suspended' where id = v_operation.target_id;
  update private.account_admin_operations set state = 'failed',
    error_code = left(coalesce(p_error_code, 'status_update_failed'), 80), completed_at = now()
    where id = p_operation_id;
  return jsonb_build_object('operationId', v_operation.id,
    'targetId', v_operation.target_id, 'status', 'failed');
end;
$$;

create or replace function public.admin_prepare_account_delete(
  p_actor_id uuid, p_target_id uuid, p_confirmation text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor text; v_target public.account_profiles; v_operation_id uuid;
begin
  v_actor := private.require_account_admin(p_actor_id);
  v_target := private.lock_manageable_account(p_target_id);
  if p_confirmation is null or p_confirmation <> v_target.username then
    raise exception 'invalid_confirmation' using errcode = '22023';
  end if;
  if exists (select 1 from private.account_admin_operations
    where target_id = p_target_id and state = 'pending') then
    raise exception 'account_action_in_progress' using errcode = '40001';
  end if;
  update public.account_profiles set status = 'suspended' where id = p_target_id;
  insert into private.account_admin_operations
    (actor_id, actor_username, target_id, target_username, action, state)
  values (p_actor_id, v_actor, p_target_id, v_target.username, 'delete', 'pending')
  returning id into v_operation_id;
  return jsonb_build_object('operationId', v_operation_id,
    'targetId', p_target_id, 'username', v_target.username);
end;
$$;

create or replace function public.admin_complete_account_delete(p_actor_id uuid, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_operation private.account_admin_operations;
begin
  perform private.require_account_admin(p_actor_id);
  select * into v_operation from private.account_admin_operations
    where id = p_operation_id and actor_id = p_actor_id and action = 'delete' for update;
  if not found then raise exception 'operation_not_found' using errcode = 'P0002'; end if;
  if v_operation.state = 'failed' then
    raise exception 'operation_failed' using errcode = '40001';
  end if;
  if exists (select 1 from auth.users where id = v_operation.target_id) then
    raise exception 'account_delete_incomplete' using errcode = '40001';
  end if;
  update private.account_admin_operations set state = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_operation_id;
  return jsonb_build_object('operationId', v_operation.id,
    'targetId', v_operation.target_id, 'status', 'completed');
end;
$$;

create or replace function public.admin_fail_account_delete(
  p_actor_id uuid, p_operation_id uuid, p_error_code text default 'delete_failed'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_operation private.account_admin_operations;
begin
  perform private.require_account_admin(p_actor_id);
  select * into v_operation from private.account_admin_operations
    where id = p_operation_id and actor_id = p_actor_id and action = 'delete' for update;
  if not found then raise exception 'operation_not_found' using errcode = 'P0002'; end if;
  if v_operation.state = 'completed' then
    raise exception 'operation_completed' using errcode = '40001';
  end if;
  update private.account_admin_operations set state = 'failed',
    error_code = left(coalesce(p_error_code, 'delete_failed'), 80), completed_at = now()
    where id = p_operation_id;
  return jsonb_build_object('operationId', v_operation.id,
    'targetId', v_operation.target_id, 'status', 'failed');
end;
$$;

-- Explicit signatures prevent Supabase's default function grants exposing admin RPCs.
revoke all on function public.admin_list_accounts(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_check_account_target(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_set_account_status(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_begin_account_status(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_account_status(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_fail_account_status(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_prepare_account_delete(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_account_delete(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_fail_account_delete(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_accounts(uuid, text, text, integer, integer) to service_role;
grant execute on function public.admin_check_account_target(uuid, uuid) to service_role;
grant execute on function public.admin_set_account_status(uuid, uuid, text) to service_role;
grant execute on function public.admin_begin_account_status(uuid, uuid, text) to service_role;
grant execute on function public.admin_complete_account_status(uuid, uuid) to service_role;
grant execute on function public.admin_fail_account_status(uuid, uuid, text) to service_role;
grant execute on function public.admin_prepare_account_delete(uuid, uuid, text) to service_role;
grant execute on function public.admin_complete_account_delete(uuid, uuid) to service_role;
grant execute on function public.admin_fail_account_delete(uuid, uuid, text) to service_role;

commit;
