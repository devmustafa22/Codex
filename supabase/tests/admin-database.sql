\set ON_ERROR_STOP on

-- Real PostgreSQL security tests. Auth API network behavior is tested separately.
insert into auth.users (id, email, last_sign_in_at, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000010', 'owner@example.test', now(), now(),
    '{"username":"mustafaasad","display_name":"مصطفى"}'),
  ('00000000-0000-0000-0000-000000000011', 'owner2@example.test', null, null,
    '{"username":"second_admin","display_name":"Second Admin"}'),
  ('00000000-0000-0000-0000-000000000012', 'searchable+first@example.test', now(), now(),
    '{"username":"member_one","display_name":"عضو البحث"}'),
  ('00000000-0000-0000-0000-000000000013', 'second@example.test', null, null,
    '{"username":"member_two","display_name":"Member Two"}'),
  ('00000000-0000-0000-0000-000000000014', 'spoof@example.test', null, null,
    '{"username":"spoof_admin","display_name":"Fake Admin","role":"admin","is_admin":true}'),
  ('00000000-0000-0000-0000-000000000015', 'delete@example.test', null, null,
    '{"username":"delete_me","display_name":"Delete Me"}');

-- Bootstrap promotion is explicit, deterministic, and safe to repeat.
insert into private.account_admins (user_id)
  select id from public.account_profiles where username = 'mustafaasad' and status = 'active'
  on conflict (user_id) do nothing;
insert into private.account_admins (user_id)
  select id from public.account_profiles where username = 'mustafaasad' and status = 'active'
  on conflict (user_id) do nothing;
insert into private.account_admins (user_id) values ('00000000-0000-0000-0000-000000000011');

do $$
declare v_function record;
begin
  if (select count(*) from private.account_admins) <> 2 then
    raise exception 'bootstrap role promotion was not idempotent';
  end if;
  for v_function in select p.oid, p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%' escape '\' loop
    if has_function_privilege('anon', v_function.oid, 'execute')
      or has_function_privilege('authenticated', v_function.oid, 'execute')
      or not has_function_privilege('service_role', v_function.oid, 'execute') then
      raise exception 'unsafe admin RPC permissions: %', v_function.proname;
    end if;
  end loop;
  if has_schema_privilege('authenticated', 'private', 'usage')
    or has_table_privilege('service_role', 'private.account_admins', 'select')
    or has_table_privilege('authenticated', 'private.account_admin_operations', 'select')
    or has_table_privilege('authenticated', 'public.account_profiles', 'update') then
    raise exception 'roles/audit/profile status grant exposes privileged data';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000014';
do $$
begin
  if public.get_account_access() <> '{"role":"user","status":"active"}'::jsonb then
    raise exception 'user-controlled metadata granted admin access';
  end if;
  if (select count(*) from public.account_profiles) <> 1 then
    raise exception 'ordinary user can list other profiles';
  end if;
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000010');
    raise exception 'ordinary client can call admin list RPC with owner ID';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into private.account_admins (user_id) values (auth.uid());
    raise exception 'ordinary client can promote itself';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.account_profiles set status = 'active';
    raise exception 'ordinary client can override account status';
  exception when insufficient_privilege then null;
  end;
  perform public.save_workspace(
    '{"version":1,"profile":{"role":"admin","is_admin":true},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, auth.uid());
  if public.get_account_access() ->> 'role' <> 'user' then
    raise exception 'workspace payload role granted admin access';
  end if;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000010';
do $$
begin
  if public.get_account_access() <> '{"role":"admin","status":"active"}'::jsonb then
    raise exception 'server-owned owner role unavailable';
  end if;
  -- Being an admin still does not expose other users' private workspaces/profiles.
  if (select count(*) from public.account_profiles) <> 1
    or (select count(*) from public.user_workspaces) <> 0 then
    raise exception 'admin frontend bypasses ownership RLS';
  end if;
  begin
    perform public.admin_set_account_status(auth.uid(), '00000000-0000-0000-0000-000000000012', 'suspended');
    raise exception 'admin client can bypass token-verifying Edge API';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select public.save_workspace(
  '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, auth.uid());
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000015';
select public.save_workspace(
  '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, auth.uid());
reset role;

create temporary table admin_test_operations (name text primary key, id uuid);
grant select, insert, update on admin_test_operations to service_role;

set role service_role;
do $$
declare v_list jsonb; v_first jsonb; v_second jsonb;
begin
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000014');
    raise exception 'spoofed metadata passed fresh service-side authorization';
  exception when insufficient_privilege then null;
  end;
  v_list := public.admin_list_accounts('00000000-0000-0000-0000-000000000010');
  if (v_list ->> 'total')::integer <> 7
    or (v_list -> 'stats' ->> 'total')::integer <> 7
    or (v_list -> 'stats' ->> 'admins')::integer <> 2
    or (v_list -> 'stats' ->> 'active')::integer <> 7
    or v_list ->> 'page' <> '1' or v_list ->> 'pageSize' <> '20' then
    raise exception 'list counts/defaults do not match database';
  end if;
  v_list := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', 'searchable+FIRST');
  if v_list ->> 'total' <> '1' or v_list -> 'accounts' -> 0 ->> 'username' <> 'member_one'
    or v_list -> 'accounts' -> 0 ->> 'emailConfirmed' <> 'true'
    or v_list -> 'accounts' -> 0 ->> 'lastSignInAt' is null then
    raise exception 'full database email search or account fields incorrect';
  end if;
  v_list := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', 'عضو البحث');
  if v_list ->> 'total' <> '1' then raise exception 'Arabic display-name search failed'; end if;
  v_list := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', '%');
  if v_list ->> 'total' <> '0' then raise exception 'search wildcards treated as broad search'; end if;
  v_first := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', '', 'all', 1, 2);
  v_second := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', '', 'all', 2, 2);
  if jsonb_array_length(v_first -> 'accounts') <> 2
    or jsonb_array_length(v_second -> 'accounts') <> 2
    or exists (select 1 from jsonb_array_elements(v_first -> 'accounts') a,
      jsonb_array_elements(v_second -> 'accounts') b where a ->> 'id' = b ->> 'id') then
    raise exception 'deterministic pagination overlaps accounts';
  end if;
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000010', '', 'all', 0, 20);
    raise exception 'invalid pagination accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000010', repeat('x', 101));
    raise exception 'oversized search accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_set_account_status('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000010', 'suspended');
    raise exception 'admin can suspend itself';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_prepare_account_delete('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000011', 'second_admin');
    raise exception 'admin can delete another protected admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_begin_account_status('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000011', 'active');
    raise exception 'admin can change another admin status';
  exception when insufficient_privilege then null;
  end;
  perform public.admin_set_account_status('00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000012', 'suspended');
  perform public.admin_set_account_status('00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000012', 'suspended');
  v_list := public.admin_list_accounts('00000000-0000-0000-0000-000000000010', '', 'suspended');
  if v_list ->> 'total' <> '1' or v_list -> 'stats' ->> 'active' <> '6' then
    raise exception 'status filter/global stats incorrect';
  end if;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from private.account_admin_operations
    where target_id = '00000000-0000-0000-0000-000000000012' and action = 'suspend') <> 1 then
    raise exception 'idempotent status update duplicated audit';
  end if;
end;
$$;

-- Keep the exact same JWT subject after suspension: access must fail immediately.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
do $$
begin
  if public.get_account_access() <> '{"role":"user","status":"suspended"}'::jsonb
    or (select count(*) from public.user_workspaces) <> 0 then
    raise exception 'old token reads suspended workspace';
  end if;
  begin
    perform public.save_workspace(
      '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 1, auth.uid());
    raise exception 'old token writes suspended workspace';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set role service_role;
select public.admin_set_account_status('00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000012', 'active');
set role authenticated;
do $$
begin
  if (select count(*) from public.user_workspaces) <> 1
    or public.get_account_access() ->> 'status' <> 'active' then
    raise exception 'restoration failed to preserve workspace';
  end if;
  perform public.save_workspace(
    '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 1, auth.uid());
end;
$$;

set role service_role;
insert into admin_test_operations values ('status', (public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000012', 'suspended') ->> 'operationId')::uuid);
do $$
begin
  begin
    perform public.admin_begin_account_status('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000012', 'active');
    raise exception 'overlapping Auth unban/ban operation accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_prepare_account_delete('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000012', 'member_one');
    raise exception 'delete overlaps pending status operation';
  exception when serialization_failure then null;
  end;
  perform public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
    (select id from admin_test_operations where name = 'status'));
  perform public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
    (select id from admin_test_operations where name = 'status'));
end;
$$;
insert into admin_test_operations values ('failed_status', (public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000012', 'active') ->> 'operationId')::uuid);
select public.admin_fail_account_status('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'failed_status'));
do $$
begin
  if (select status from public.account_profiles where username = 'member_one') <> 'suspended' then
    raise exception 'failed Auth unban reactivated database';
  end if;
  begin
    perform public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
      (select id from admin_test_operations where name = 'failed_status'));
    raise exception 'failed operation later completed';
  exception when serialization_failure then null;
  end;
end;
$$;
insert into admin_test_operations values ('expired', (public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000012', 'active') ->> 'operationId')::uuid);
reset role;
update private.account_admin_operations set created_at = now() - interval '16 minutes'
  where id = (select id from admin_test_operations where name = 'expired');
set role service_role;
insert into admin_test_operations values ('retry', (public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000012', 'suspended') ->> 'operationId')::uuid);
do $$
begin
  begin
    perform public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
      (select id from admin_test_operations where name = 'expired'));
    raise exception 'expired operation can override a newer status';
  exception when serialization_failure then null;
  end;
  perform public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
    (select id from admin_test_operations where name = 'retry'));
  begin
    perform public.admin_prepare_account_delete('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000015', 'wrong_username');
    raise exception 'delete accepted wrong confirmation';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
-- A late failure callback for an expired or already-failed operation must not
-- alter a newer completed reactivation or its pending reservation.
insert into admin_test_operations values ('new_restore', (public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000012', 'active') ->> 'operationId')::uuid);
select public.admin_complete_account_status('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'new_restore'));
select public.admin_fail_account_status('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'expired'));
select public.admin_fail_account_status('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'failed_status'));
do $$
begin
  if (select status from public.account_profiles where username = 'member_one') <> 'active' then
    raise exception 'stale failure re-suspended a newer completed restoration';
  end if;
end;
$$;
select public.admin_set_account_status('00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000012', 'suspended');
insert into admin_test_operations values ('failed_delete', (public.admin_prepare_account_delete(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000015', 'delete_me') ->> 'operationId')::uuid);
select public.admin_fail_account_delete('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'failed_delete'));
insert into admin_test_operations values ('delete', (public.admin_prepare_account_delete(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000015', 'delete_me') ->> 'operationId')::uuid);
reset role;
update private.account_admin_operations set created_at = now() - interval '1 day'
  where id = (select id from admin_test_operations where name = 'delete');
set role service_role;
do $$
begin
  begin
    perform public.admin_begin_account_status('00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000015', 'active');
    raise exception 'uncertain pending deletion expired and permitted reactivation';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_complete_account_delete('00000000-0000-0000-0000-000000000010',
      (select id from admin_test_operations where name = 'delete'));
    raise exception 'delete completed before Auth removed user';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_complete_account_delete('00000000-0000-0000-0000-000000000011',
      (select id from admin_test_operations where name = 'delete'));
    raise exception 'another admin can complete actor-owned operation';
  exception when no_data_found then null;
  end;
end;
$$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000015';
do $$
begin
  if (select count(*) from public.user_workspaces) <> 0 then
    raise exception 'pending deletion old token can read workspace';
  end if;
end;
$$;
reset role;
-- Simulates successful Supabase Auth Admin delete, including real FK cascades.
delete from auth.users where id = '00000000-0000-0000-0000-000000000015';
set role service_role;
select public.admin_complete_account_delete('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'delete'));
select public.admin_complete_account_delete('00000000-0000-0000-0000-000000000010',
  (select id from admin_test_operations where name = 'delete'));
set role authenticated;
do $$
begin
  if public.get_account_access() <> '{"role":"user","status":"deleted"}'::jsonb then
    raise exception 'old deleted-account token still has access';
  end if;
  begin
    perform public.save_workspace(
      '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, auth.uid());
    raise exception 'deleted old token can recreate workspace';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.account_profiles where username = 'delete_me')
    or exists (select 1 from public.user_workspaces where user_id = '00000000-0000-0000-0000-000000000015') then
    raise exception 'Auth deletion left profile or workspace data behind';
  end if;
  if not exists (select 1 from private.account_admin_operations
    where target_id = '00000000-0000-0000-0000-000000000015'
      and action = 'delete' and state = 'completed' and target_username = 'delete_me') then
    raise exception 'Auth deletion erased durable audit';
  end if;
  -- Server-admin authorization also observes a suspension immediately.
  update public.account_profiles set status = 'suspended'
    where id = '00000000-0000-0000-0000-000000000011';
end;
$$;
set role service_role;
do $$
begin
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000011');
    raise exception 'suspended admin retained management access';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
update public.account_profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000011';
delete from private.account_admins where user_id = '00000000-0000-0000-0000-000000000011';
set role service_role;
do $$
begin
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000011');
    raise exception 'revoked admin retained management access';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
insert into private.account_admins (user_id) values ('00000000-0000-0000-0000-000000000011');
set role anon;
do $$
begin
  begin
    perform public.get_account_access();
    raise exception 'anonymous access RPC exposed account role';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_accounts('00000000-0000-0000-0000-000000000010');
    raise exception 'anonymous admin RPC access';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select 'Admin authorization, search, suspension, restoration, serialized operations, expiry, deletion, and audit checks passed.' as result;
