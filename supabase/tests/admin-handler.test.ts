import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedOrigins } from '../functions/username-login/helpers.ts';
import {
  AdminBackendError,
  DefiniteAuthFailure,
  adminRpcError,
  bearerToken,
  parseAdminRequest,
} from '../functions/account-admin/helpers.ts';
import { createAdminHandler } from '../functions/account-admin/handler.ts';
import type { AccountList, AdminBackend } from '../functions/account-admin/handler.ts';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'signed.user.token';
const ORIGIN = 'https://madar.workers.dev';
const account = { id: TARGET, username: 'alice', status: 'suspended' as const };
const listing: AccountList = {
  accounts: [
    {
      ...account,
      displayName: 'Alice',
      email: 'alice@example.test',
      role: 'user',
      createdAt: '2026-10-07T00:00:00Z',
      lastSignInAt: null,
      emailConfirmed: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  stats: { total: 2, active: 1, suspended: 1, admins: 1 },
};

function setup(overrides: Partial<AdminBackend> = {}) {
  const calls: string[] = [];
  const backend: AdminBackend = {
    async authenticate(token) {
      calls.push(`authenticate:${token}`);
      return ACTOR;
    },
    async listAccounts(actorId, input) {
      calls.push(`list:${actorId}:${input.page}:${input.pageSize}:${input.search}:${input.status}`);
      return listing;
    },
    async beginStatus(actorId, targetId, status) {
      calls.push(`begin:${actorId}:${targetId}:${status}`);
      return { operationId: OPERATION, targetId, username: 'alice', status };
    },
    async completeStatus(actorId, operationId) {
      calls.push(`complete-status:${actorId}:${operationId}`);
      return { targetId: TARGET, status: 'suspended' };
    },
    async failStatus(actorId, operationId) {
      calls.push(`fail-status:${actorId}:${operationId}`);
    },
    async banAccount(targetId) {
      calls.push(`ban:${targetId}`);
    },
    async unbanAccount(targetId) {
      calls.push(`unban:${targetId}`);
    },
    async prepareDelete(actorId, targetId, confirmation) {
      calls.push(`prepare-delete:${actorId}:${targetId}:${confirmation}`);
      return { operationId: OPERATION, targetId, username: 'alice' };
    },
    async deleteAccount(targetId) {
      calls.push(`delete-auth:${targetId}`);
    },
    async completeDelete(actorId, operationId) {
      calls.push(`complete-delete:${actorId}:${operationId}`);
    },
    async failDelete(actorId, operationId) {
      calls.push(`fail-delete:${actorId}:${operationId}`);
    },
    ...overrides,
  };
  const handler = createAdminHandler({
    origins: allowedOrigins(ORIGIN),
    configured: true,
    createBackend: () => backend,
  });
  const request = (payload: unknown = { action: 'list' }, headers: Record<string, string> = {}) =>
    new Request('https://example.test/functions/v1/account-admin', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  return { calls, backend, handler, request };
}

test('admin request parser bounds pagination, search, status, UUIDs and typed deletion confirmation', () => {
  assert.deepEqual(parseAdminRequest({ action: 'list' }), {
    action: 'list',
    page: 1,
    pageSize: 20,
    search: '',
    status: 'all',
  });
  assert.deepEqual(
    parseAdminRequest({
      action: 'list',
      page: 2,
      pageSize: 50,
      search: ' Alice ',
      status: 'suspended',
    }),
    { action: 'list', page: 2, pageSize: 50, search: 'Alice', status: 'suspended' },
  );
  assert.deepEqual(parseAdminRequest({ action: 'delete', userId: TARGET, confirmation: 'alice' }), {
    action: 'delete',
    userId: TARGET,
    confirmation: 'alice',
  });
  for (const input of [
    { action: ['suspend'], userId: TARGET },
    { action: 'list', status: ['active'] },
    { action: 'list', page: null },
    { action: 'list', pageSize: null },
    { action: 'list', search: null },
    { action: 'list', status: null },
    null,
    [],
    {},
    { action: 'all' },
    { action: 'list', page: 0 },
    { action: 'list', page: 1.5 },
    { action: 'list', page: '1' },
    { action: 'list', pageSize: 51 },
    { action: 'list', pageSize: 0 },
    { action: 'list', search: 'x'.repeat(101) },
    { action: 'list', search: 'bad\u0000' },
    { action: 'list', status: 'admin' },
    { action: 'suspend', userId: 'not-a-uuid' },
    { action: 'delete', userId: TARGET },
    { action: 'delete', userId: TARGET, confirmation: 'ALICE' },
    { action: 'delete', userId: TARGET, confirmation: ' alice' },
    { action: 'list', actorId: ACTOR },
    { action: 'list', role: 'admin' },
    { action: 'suspend', userId: TARGET, metadata: { role: 'admin' } },
  ]) {
    assert.equal(parseAdminRequest(input), null, JSON.stringify(input));
  }
});

test('bearer parser requires a bounded JWT and does not decode trust into a role', () => {
  assert.equal(bearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(bearerToken(`bearer ${TOKEN}`), TOKEN);
  for (const header of [
    null,
    'Bearer sb_secret_private',
    'Bearer a.b',
    'Basic a.b.c',
    'Bearer a.b.c extra',
    'Bearer ' + 'a'.repeat(8192),
  ])
    assert.equal(bearerToken(header), null);
});

test('missing and malformed authentication stop before backend access', async () => {
  const { calls, handler, request } = setup();
  for (const authorization of ['', 'Bearer broken', 'Bearer sb_secret_private']) {
    const response = await handler(request({ action: 'list' }, { authorization }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'authentication_required' });
  }
  assert.deepEqual(calls, []);
});

test('expired or revoked JWT receives 401 even when body names a valid admin action', async () => {
  const { calls, handler, request } = setup({
    async authenticate() {
      calls.push('fresh-user-invalid');
      return null;
    },
  });
  assert.equal((await handler(request({ action: 'suspend', userId: TARGET }))).status, 401);
  assert.deepEqual(calls, ['fresh-user-invalid']);
});

test('Auth validation outage returns generic 503 and does not misclassify a session as unauthorized', async () => {
  const { calls, handler, request } = setup({
    async authenticate() {
      calls.push('auth-validation-outage');
      throw new Error('private token network failure');
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'admin_temporarily_unavailable' });
  assert.deepEqual(calls, ['auth-validation-outage']);
});

test('identity comes only from fresh Auth lookup and spoofed actor or editable roles are rejected', async () => {
  const { calls, handler, request } = setup();
  for (const payload of [
    { action: 'list', actorId: 'other-admin' },
    { action: 'list', role: 'admin' },
    { action: 'suspend', userId: TARGET, user_metadata: { role: 'admin' } },
  ]) {
    assert.equal((await handler(request(payload))).status, 400);
  }
  assert.deepEqual(calls, []);
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls, [`authenticate:${TOKEN}`, `list:${ACTOR}:1:20::all`]);
});

test('ordinary and suspended users cannot list or mutate accounts', async () => {
  const { calls, handler, request } = setup({
    async listAccounts() {
      calls.push('role-check');
      throw new AdminBackendError('admin_required');
    },
    async beginStatus() {
      calls.push('role-check');
      throw new AdminBackendError('admin_required');
    },
    async prepareDelete() {
      calls.push('role-check');
      throw new AdminBackendError('admin_required');
    },
  });
  for (const action of ['list', 'suspend', 'reactivate', 'delete']) {
    const payload =
      action === 'list'
        ? { action }
        : action === 'delete'
          ? { action, userId: TARGET, confirmation: 'alice' }
          : { action, userId: TARGET };
    const response = await handler(request(payload));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'admin_required' });
  }
  assert.equal(
    calls.some(
      (call) =>
        call.startsWith('ban:') || call.startsWith('unban:') || call.startsWith('delete-auth:'),
    ),
    false,
  );
});

test('admin list returns bounded pagination metadata and account fields without secrets or workspaces', async () => {
  const { calls, handler, request } = setup();
  const response = await handler(
    request({ action: 'list', page: 2, pageSize: 10, search: 'alice', status: 'suspended' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), listing);
  assert.deepEqual(calls, [`authenticate:${TOKEN}`, `list:${ACTOR}:2:10:alice:suspended`]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('suspend denies database access before Auth ban and finalizes the durable operation afterwards', async () => {
  const { calls, handler, request } = setup();
  const response = await handler(request({ action: 'suspend', userId: TARGET }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { account });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `begin:${ACTOR}:${TARGET}:suspended`,
    `ban:${TARGET}`,
    `complete-status:${ACTOR}:${OPERATION}`,
  ]);
});

test('failed Auth ban leaves account suspended, records failure and truthfully exposes retryable partial completion', async () => {
  const { calls, handler, request } = setup({
    async banAccount() {
      calls.push('ban-failed');
      throw new DefiniteAuthFailure();
    },
  });
  const response = await handler(request({ action: 'suspend', userId: TARGET }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_suspended_auth_pending',
    retryable: true,
    account,
  });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `begin:${ACTOR}:${TARGET}:suspended`,
    'ban-failed',
    `fail-status:${ACTOR}:${OPERATION}`,
  ]);
});

test('reactivate reserves and authorizes target before Auth unban then enables database access last', async () => {
  const { calls, handler, request } = setup({
    async completeStatus(actorId, operationId) {
      calls.push(`complete-status:${actorId}:${operationId}`);
      return { targetId: TARGET, status: 'active' };
    },
  });
  const response = await handler(request({ action: 'reactivate', userId: TARGET }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { account: { ...account, status: 'active' } });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `begin:${ACTOR}:${TARGET}:active`,
    `unban:${TARGET}`,
    `complete-status:${ACTOR}:${OPERATION}`,
  ]);
});

test('failed Auth unban never activates database access', async () => {
  const { calls, handler, request } = setup({
    async unbanAccount() {
      calls.push('unban-failed');
      throw new DefiniteAuthFailure();
    },
  });
  const response = await handler(request({ action: 'reactivate', userId: TARGET }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_reactivation_failed',
    retryable: true,
    account,
  });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `begin:${ACTOR}:${TARGET}:active`,
    'unban-failed',
    `fail-status:${ACTOR}:${OPERATION}`,
  ]);
});

test('privilege loss before activation completion cannot enable database access', async () => {
  const { calls, handler, request } = setup({
    async completeStatus() {
      calls.push('privileges-rechecked');
      throw new AdminBackendError('admin_required');
    },
  });
  const response = await handler(request({ action: 'reactivate', userId: TARGET }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_reactivation_failed',
    retryable: true,
    account,
  });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `begin:${ACTOR}:${TARGET}:active`,
    `unban:${TARGET}`,
    'privileges-rechecked',
    `fail-status:${ACTOR}:${OPERATION}`,
  ]);
});

test('ambiguous ban or unban network failure preserves the pending reservation and suspended database gate', async () => {
  for (const action of ['suspend', 'reactivate']) {
    const { calls, handler, request } = setup({
      async banAccount() {
        calls.push('ban-response-lost');
        throw new Error('network timeout');
      },
      async unbanAccount() {
        calls.push('unban-response-lost');
        throw new Error('network timeout');
      },
    });
    const response = await handler(request({ action, userId: TARGET }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'account_action_pending',
      retryable: true,
      pending: true,
      retryAfterSeconds: 900,
      account,
    });
    assert.equal(
      calls.some((call) => call.startsWith('fail-status:') || call.startsWith('complete-status:')),
      false,
    );
  }
});

test('unknown SQL completion response never invents active or suspended state and does not release reservation', async () => {
  const { calls, handler, request } = setup({
    async completeStatus() {
      calls.push('sql-response-lost');
      throw new Error('gateway timeout');
    },
  });
  const response = await handler(request({ action: 'reactivate', userId: TARGET }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_status_confirmation_pending',
    retryable: true,
    pending: true,
    retryAfterSeconds: 900,
    targetId: TARGET,
  });
  assert.equal(
    calls.some((call) => call.startsWith('fail-status:')),
    false,
  );
});

test('self and every administrator target are protected before any Auth change', async () => {
  const { calls, handler, request } = setup({
    async beginStatus() {
      calls.push('protected-target');
      throw new AdminBackendError('protected_admin');
    },
    async prepareDelete() {
      calls.push('protected-target');
      throw new AdminBackendError('protected_admin');
    },
  });
  for (const action of ['suspend', 'reactivate', 'delete']) {
    const response = await handler(
      request(
        action === 'delete'
          ? { action, userId: ACTOR, confirmation: 'mustafaasad' }
          : { action, userId: ACTOR },
      ),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'protected_admin' });
  }
  assert.equal(
    calls.some(
      (call) =>
        call.startsWith('ban:') || call.startsWith('unban:') || call.startsWith('delete-auth:'),
    ),
    false,
  );
});

test('another pending operation rejects overlapping status or deletion changes', async () => {
  const { calls, handler, request } = setup({
    async beginStatus() {
      throw new AdminBackendError('account_action_in_progress');
    },
  });
  const response = await handler(request({ action: 'reactivate', userId: TARGET }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'account_action_in_progress' });
  assert.deepEqual(calls, [`authenticate:${TOKEN}`]);
});

test('incorrect typed username is rejected in SQL before deletion reaches Auth', async () => {
  const { calls, handler, request } = setup({
    async prepareDelete() {
      calls.push('confirmation-checked');
      throw new AdminBackendError('invalid_confirmation');
    },
  });
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'wrong_name' }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_confirmation' });
  assert.deepEqual(calls, [`authenticate:${TOKEN}`, 'confirmation-checked']);
});

test('hard deletion is prepared durably before Auth removal and completed only after Auth success', async () => {
  const { calls, handler, request } = setup();
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'alice' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, targetId: TARGET });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `prepare-delete:${ACTOR}:${TARGET}:alice`,
    `delete-auth:${TARGET}`,
    `complete-delete:${ACTOR}:${OPERATION}`,
  ]);
});

test('Auth deletion failure leaves the prepared account suspended and durable failed audit', async () => {
  const { calls, handler, request } = setup({
    async deleteAccount() {
      calls.push('delete-failed');
      throw new DefiniteAuthFailure();
    },
  });
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'alice' }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_delete_failed',
    retryable: true,
    suspended: true,
  });
  assert.deepEqual(calls, [
    `authenticate:${TOKEN}`,
    `prepare-delete:${ACTOR}:${TARGET}:alice`,
    'delete-failed',
    `fail-delete:${ACTOR}:${OPERATION}`,
  ]);
});

test('audit service failure after failed deletion preserves the original pending record and avoids claiming success', async () => {
  const { handler, request } = setup({
    async deleteAccount() {
      throw new DefiniteAuthFailure();
    },
    async failDelete() {
      throw new Error('audit down');
    },
  });
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'alice' }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_delete_failed',
    retryable: true,
    suspended: true,
  });
});

test('actual Auth deletion with failed audit finalization is reported truthfully', async () => {
  const { calls, handler, request } = setup({
    async completeDelete() {
      calls.push('audit-failed');
      throw new Error('private database error');
    },
  });
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'alice' }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_deleted_audit_pending',
    deleted: true,
    retryable: false,
    targetId: TARGET,
  });
  assert.equal(
    calls.some((call) => call.startsWith('fail-delete:')),
    false,
  );
});

test('unknown Auth deletion outcome remains reserved indefinitely and never encourages another deletion', async () => {
  const { calls, handler, request } = setup({
    async deleteAccount() {
      calls.push('delete-response-lost');
      throw new Error('network timeout after possible commit');
    },
  });
  const response = await handler(
    request({ action: 'delete', userId: TARGET, confirmation: 'alice' }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'account_delete_unknown',
    retryable: false,
    pending: true,
    targetId: TARGET,
  });
  assert.equal(
    calls.some((call) => call.startsWith('fail-delete:') || call.startsWith('complete-delete:')),
    false,
  );
});

test('CORS accepts exact origin preflight while refusing foreign origins before backend access', async () => {
  const { calls, handler, request } = setup();
  const preflight = await handler(
    new Request('https://example.test', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /authorization/);
  const rejected = await handler(request({ action: 'list' }, { origin: 'https://evil.test' }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(calls, []);
});

test('oversized JSON with dishonest content length is rejected before authentication', async () => {
  const { calls, handler, request } = setup();
  const response = await handler(
    request({ action: 'list', search: 'x'.repeat(8193) }, { 'content-length': '1' }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test('unexpected backend errors never expose email, keys or database traces', async () => {
  const { handler, request } = setup({
    async listAccounts() {
      throw new Error('alice@example.test sb_secret_private SQL password');
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'admin_temporarily_unavailable' });
  assert.equal(
    adminRpcError({ message: 'secret@email SQLstack', code: '42501' }).code,
    'admin_temporarily_unavailable',
  );
  assert.equal(
    adminRpcError({ message: 'protected_admin', code: '42501' }).code,
    'protected_admin',
  );
});

test('missing server configuration and unsupported methods are fail closed', async () => {
  const { request } = setup();
  const handler = createAdminHandler({
    origins: allowedOrigins(ORIGIN),
    configured: false,
    createBackend() {
      throw new Error('must not create');
    },
  });
  assert.equal((await handler(request())).status, 503);
  assert.equal(
    (
      await handler(
        new Request('https://example.test', { method: 'GET', headers: { origin: ORIGIN } }),
      )
    ).status,
    405,
  );
});
