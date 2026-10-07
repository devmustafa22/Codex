#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="madar-backend-test-${RANDOM}-${RANDOM}"
test_tmp="$(mktemp -d)"
cleanup() {
  docker rm --force "$container_name" >/dev/null 2>&1 || true
  rm -rf "$test_tmp"
}
trap cleanup EXIT

# No host ports or host directories are mounted; this is a disposable database.
docker run --detach --name "$container_name" --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready --host 127.0.0.1 --username postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.2
done
if [[ "$ready" != true ]]; then
  docker logs "$container_name"
  exit 1
fi

run_sql() {
  docker exec --interactive "$container_name" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1 "$@"
}
run_sql --quiet < "$task_root/supabase/tests/bootstrap.sql"
run_sql --quiet < "$task_root/supabase/migrations/202610060001_cloud_accounts.sql"
# Reapplying should retain data and safely replace the functions/policies.
run_sql --quiet < "$task_root/supabase/migrations/202610060001_cloud_accounts.sql"
run_sql --quiet < "$task_root/supabase/tests/database.sql"

cat > "$test_tmp/concurrent.sql" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select revision from public.save_workspace(
  '{"version":1,"profile":{"name":"Concurrent"},"tasks":[],"skills":[],"entries":[],"events":[]}', 2, auth.uid());
SQL
run_sql --quiet < "$test_tmp/concurrent.sql" > "$test_tmp/first.out" 2>&1 &
first_pid=$!
run_sql --quiet < "$test_tmp/concurrent.sql" > "$test_tmp/second.out" 2>&1 &
second_pid=$!
first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?
if [[ "$first_status" -eq 0 && "$second_status" -ne 0 ]]; then
  conflict_output="$test_tmp/second.out"
elif [[ "$first_status" -ne 0 && "$second_status" -eq 0 ]]; then
  conflict_output="$test_tmp/first.out"
else
  cat "$test_tmp/first.out" "$test_tmp/second.out"
  exit 1
fi
if ! rg --quiet 'workspace_conflict' "$conflict_output"; then
  cat "$conflict_output"
  exit 1
fi
run_sql --quiet <<'SQL'
do $$
begin
  if (select revision from public.user_workspaces where user_id = '00000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'concurrent save incorrectly overwrote latest revision';
  end if;
  delete from auth.users where id = '00000000-0000-0000-0000-000000000002';
  if exists (select 1 from public.user_workspaces where user_id = '00000000-0000-0000-0000-000000000002')
    or exists (select 1 from public.account_profiles where id = '00000000-0000-0000-0000-000000000002') then
    raise exception 'deleted account left private data behind';
  end if;
end;
$$;
SQL
printf '%s\n' 'Concurrent revision protection and account deletion checks passed.'

run_sql --quiet < "$task_root/supabase/migrations/202610070001_account_administration.sql"
run_sql --quiet < "$task_root/supabase/migrations/202610070001_account_administration.sql"
run_sql --quiet <<'SQL'
do $$
begin
  if exists (select 1 from private.account_admins) then
    raise exception 'generic migration silently promoted an account';
  end if;
end;
$$;
SQL
run_sql --quiet < "$task_root/supabase/tests/admin-database.sql"

cat > "$test_tmp/concurrent-admin.sql" <<'SQL'
set role service_role;
select public.admin_begin_account_status(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000013', 'suspended');
SQL
run_sql --quiet < "$test_tmp/concurrent-admin.sql" > "$test_tmp/admin-first.out" 2>&1 &
first_pid=$!
run_sql --quiet < "$test_tmp/concurrent-admin.sql" > "$test_tmp/admin-second.out" 2>&1 &
second_pid=$!
first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?
if [[ "$first_status" -eq 0 && "$second_status" -ne 0 ]]; then
  conflict_output="$test_tmp/admin-second.out"
elif [[ "$first_status" -ne 0 && "$second_status" -eq 0 ]]; then
  conflict_output="$test_tmp/admin-first.out"
else
  cat "$test_tmp/admin-first.out" "$test_tmp/admin-second.out"
  exit 1
fi
if ! rg --quiet 'account_action_in_progress' "$conflict_output"; then
  cat "$conflict_output"
  exit 1
fi
run_sql --quiet <<'SQL'
do $$
begin
  if (select count(*) from private.account_admin_operations
    where target_id = '00000000-0000-0000-0000-000000000013' and state = 'pending') <> 1 then
    raise exception 'concurrent management created overlapping pending operations';
  end if;
end;
$$;
SQL
printf '%s\n' 'Concurrent administration operations produce exactly one reservation.'

# A second application must preserve role assignments, status, and audit history.
run_sql --quiet < "$task_root/supabase/migrations/202610070001_account_administration.sql"
run_sql --quiet <<'SQL'
do $$
begin
  if (select count(*) from private.account_admins) <> 2 then
    raise exception 'migration reapplication reset admin roles';
  end if;
  if not exists (select 1 from private.account_admin_operations where action = 'delete' and state = 'completed') then
    raise exception 'migration reapplication erased audit history';
  end if;
  if (select status from public.account_profiles where username = 'member_one') <> 'suspended' then
    raise exception 'migration reapplication reactivated a suspended account';
  end if;
end;
$$;
SQL
printf '%s\n' 'Administration migration reapplication and audit retention checks passed.'

run_sql --quiet < "$task_root/supabase/promote-owner.sql"
run_sql --quiet < "$task_root/supabase/promote-owner.sql"
expect_bootstrap_rejected() {
  local sql_prefix="$1"
  local expected_error="$2"
  # Any fixture changes are kept inside a transaction. psql exiting on the
  # expected exception rolls it back, so the real next case starts clean.
  if { printf '%s\n' "$sql_prefix"; cat "$task_root/supabase/promote-owner.sql"; } \
    | run_sql --quiet > "$test_tmp/bootstrap-negative.out" 2>&1; then
    cat "$test_tmp/bootstrap-negative.out"
    exit 1
  fi
  if ! rg --quiet "$expected_error" "$test_tmp/bootstrap-negative.out"; then
    cat "$test_tmp/bootstrap-negative.out"
    exit 1
  fi
}
expect_bootstrap_rejected 'set role authenticated;' 'owner_bootstrap_requires_sql_editor_postgres'
expect_bootstrap_rejected "begin; update public.account_profiles set username = 'renamed_owner' where username = 'mustafaasad';" \
  'owner_account_mustafaasad_not_found'
expect_bootstrap_rejected "begin; update public.account_profiles set status = 'suspended' where username = 'mustafaasad';" \
  'owner_account_must_be_active'
expect_bootstrap_rejected "begin; insert into private.account_admin_operations (actor_id, actor_username, target_id, target_username, action, state) values ('00000000-0000-0000-0000-000000000010', 'mustafaasad', '00000000-0000-0000-0000-000000000010', 'mustafaasad', 'suspend', 'pending');" \
  'owner_pending_operation_requires_operator_review'
printf '%s\n' 'Owner bootstrap idempotence, privilege, missing-account, suspended-account, and pending-operation checks passed.'
