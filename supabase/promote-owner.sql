-- Explicit owner bootstrap for the existing Madar account mustafaasad.
-- Run only in Supabase SQL Editor with the postgres role, AFTER applying
-- migrations/202610070001_account_administration.sql.
-- This is deliberately separate from the generic migration: signing up first
-- or choosing an owner's username never automatically grants administration.
-- It creates no Auth account and changes no password or user metadata.

begin;

do $owner_bootstrap$
declare
  owner_id uuid;
  owner_status text;
begin
  if current_user <> 'postgres' then
    raise exception 'owner_bootstrap_requires_sql_editor_postgres';
  end if;

  if to_regclass('private.account_admins') is null then
    raise exception 'apply_account_administration_migration_first';
  end if;

  begin
    select profile.id, profile.status
      into strict owner_id, owner_status
      from public.account_profiles as profile
      where profile.username = 'mustafaasad'
      for update;
  exception
    when no_data_found then
      raise exception 'owner_account_mustafaasad_not_found';
    when too_many_rows then
      raise exception 'owner_username_must_be_unique';
  end;

  -- Do not silently undo a suspension or bypass an Auth ban while granting a
  -- role. Resolve an inactive account with the operator before promoting it.
  if owner_status <> 'active' then
    raise exception 'owner_account_must_be_active';
  end if;

  -- Profile locking is shared with administrative preparation. Do not protect
  -- an account midway through an already authorized external Auth operation.
  if exists (
    select 1 from private.account_admin_operations as operation
    where operation.target_id = owner_id and operation.state = 'pending'
  ) then
    raise exception 'owner_pending_operation_requires_operator_review';
  end if;

  insert into private.account_admins (user_id)
    values (owner_id)
    on conflict (user_id) do nothing;
end;
$owner_bootstrap$;

-- Expected result: mustafaasad | active | admin. No credentials are returned.
select profile.username,
       profile.status,
       case when exists (
         select 1 from private.account_admins as administrator
         where administrator.user_id = profile.id
       ) then 'admin' else 'user' end as role
  from public.account_profiles as profile
  where profile.username = 'mustafaasad';

commit;
