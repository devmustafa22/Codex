\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.test',
    '{"username":" ALICE_1 ","display_name":"مصطفى","user_id":"00000000-0000-0000-0000-000000000002"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.test',
    '{"username":"bob_2","display_name":"Bob"}');

do $$
begin
  if (select username from public.account_profiles where id = '00000000-0000-0000-0000-000000000001') <> 'alice_1' then
    raise exception 'username normalization failed';
  end if;
  begin
    insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000003', '{"username":"alice_1"}');
    raise exception 'duplicate username accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000003', '{"username":"bad username"}');
    raise exception 'invalid username accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000003', '{}');
    raise exception 'missing username accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare
  v_saved public.user_workspaces;
  v_payload jsonb := '{"version":1,"profile":{"name":"Alice"},"tasks":[],"skills":[],"entries":[],"events":[]}';
begin
  if (select count(*) from public.account_profiles) <> 1 then
    raise exception 'profile RLS leaked another account';
  end if;
  select * into v_saved from public.save_workspace(v_payload, 0, auth.uid());
  if v_saved.user_id <> auth.uid() or v_saved.revision <> 1 then
    raise exception 'initial save identity/revision incorrect';
  end if;
  begin
    perform public.save_workspace(v_payload, 0, auth.uid());
    raise exception 'duplicate initial save accepted';
  exception when serialization_failure then null;
  end;
  select * into v_saved from public.save_workspace(v_payload || '{"test":"changed"}', 1, auth.uid());
  if v_saved.revision <> 2 or v_saved.payload ->> 'test' <> 'changed' then
    raise exception 'update did not increment revision or save payload';
  end if;
  begin
    perform public.save_workspace(v_payload, 1, auth.uid());
    raise exception 'stale overwrite accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_workspace('{}'::jsonb, 2, auth.uid());
    raise exception 'invalid workspace accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_workspace(v_payload || jsonb_build_object('large', repeat('x', 5242881)), 2, auth.uid());
    raise exception 'oversized workspace accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_workspace(v_payload, -1, auth.uid());
    raise exception 'negative revision accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_workspace(v_payload, 2, '00000000-0000-0000-0000-000000000002');
    raise exception 'captured account mismatch saved workspace';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_workspaces set revision = 100;
    raise exception 'direct update permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_workspaces (user_id, payload) values (auth.uid(), v_payload);
    raise exception 'direct insert permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.user_workspaces;
    raise exception 'direct delete permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_username_login_limits(repeat('a', 64), repeat('b', 64));
    raise exception 'authenticated user accessed privileged rate limiter';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
declare
  v_saved public.user_workspaces;
begin
  if (select count(*) from public.user_workspaces) <> 0 then
    raise exception 'workspace RLS leaked Alice data to Bob';
  end if;
  if exists (select 1 from public.account_profiles where username = 'alice_1') then
    raise exception 'profile username lookup leaked another account';
  end if;
  select * into v_saved from public.save_workspace(
    '{"version":1,"profile":{"name":"Bob"},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, auth.uid());
  if v_saved.user_id <> auth.uid() or (select count(*) from public.user_workspaces) <> 1 then
    raise exception 'Bob save ownership failed';
  end if;
end;
$$;

set request.jwt.claim.sub = '';
do $$
begin
  if (select count(*) from public.user_workspaces) <> 0 then
    raise exception 'missing JWT UID can read workspace';
  end if;
  begin
    perform public.save_workspace(
      '{"version":1,"profile":{},"tasks":[],"skills":[],"entries":[],"events":[]}', 0, '00000000-0000-0000-0000-000000000001');
    raise exception 'missing JWT UID saved workspace';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set role anon;
do $$
begin
  begin
    perform username from public.account_profiles;
    raise exception 'anonymous profile access allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform payload from public.user_workspaces;
    raise exception 'anonymous workspace access allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_workspace('{}'::jsonb, 0, '00000000-0000-0000-0000-000000000001');
    raise exception 'anonymous save RPC execution allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set role service_role;
do $$
begin
  if (select count(*) from public.account_profiles) <> 2 then
    raise exception 'server profile lookup unavailable';
  end if;
  for i in 1..30 loop
    if public.consume_username_login_limits(repeat('a', 64), repeat('b', 64)) is not true then
      raise exception 'username limited before configured allowance';
    end if;
  end loop;
  if public.consume_username_login_limits(repeat('a', 64), repeat('b', 64)) is not false then
    raise exception 'username limit did not enforce threshold';
  end if;
  for i in 1..100 loop
    if public.consume_username_login_limits(lpad(to_hex(i), 64, '0'), repeat('c', 64)) is not true then
      raise exception 'IP limited before configured allowance';
    end if;
  end loop;
  if public.consume_username_login_limits(repeat('d', 64), repeat('c', 64)) is not false then
    raise exception 'IP limit did not enforce threshold';
  end if;
  begin
    perform public.consume_username_login_limits('invalid', repeat('c', 64));
    raise exception 'invalid limiter key accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;
update private.username_login_limits set expires_at = now() - interval '1 minute';
set role service_role;
do $$
begin
  if public.consume_username_login_limits(repeat('a', 64), repeat('b', 64)) is not true then
    raise exception 'expired rate limit did not reset';
  end if;
end;
$$;
reset role;

select 'Database ownership, permissions, payload guards and limiter checks passed.' as result;
