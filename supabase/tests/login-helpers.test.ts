import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowedOrigins,
  parseCredentials,
  privateHash,
  rateLimitAddress,
  readBoundedJson,
  responseHeaders,
} from '../functions/username-login/helpers.ts';
import { createLoginHandler } from '../functions/username-login/handler.ts';
import type { LoginBackend } from '../functions/username-login/handler.ts';

test('credential normalization preserves password exactly and rejects invalid input', () => {
  assert.deepEqual(parseCredentials({ identifier: ' ALICE_1 ', password: ' space matters ' }), {
    identifier: 'alice_1',
    password: ' space matters ',
  });
  for (const input of [
    null,
    [],
    {},
    { identifier: 'al', password: 'password' },
    { identifier: 'alice@example.test', password: 'password' },
    { identifier: 'اسم', password: 'password' },
    { identifier: 'alice_1', password: '' },
    { identifier: 'alice_1', password: 'x'.repeat(129) },
  ]) {
    assert.equal(parseCredentials(input), null);
  }
});

test('CORS accepts exact origins and never emits a wildcard', () => {
  const origins = allowedOrigins(
    'https://madar.pages.dev,http://localhost:5173,*,https://bad.test/path,https://user:pass@bad.test',
  );
  assert.deepEqual([...origins], ['https://madar.pages.dev', 'http://localhost:5173']);
  const allowed = responseHeaders('https://madar.pages.dev', origins);
  assert.equal(allowed.get('access-control-allow-origin'), 'https://madar.pages.dev');
  assert.equal(allowed.get('cache-control'), 'no-store');
  assert.equal(
    responseHeaders('https://evil.test', origins).get('access-control-allow-origin'),
    null,
  );
  assert.equal(responseHeaders(null, origins).get('access-control-allow-origin'), null);
});

test('request reader rejects oversized bodies even without an honest content-length', async () => {
  const valid = new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'alice', password: 'password' }),
  });
  assert.deepEqual(await readBoundedJson(valid), { identifier: 'alice', password: 'password' });
  const large = new Request('https://example.test', {
    method: 'POST',
    body: 'x'.repeat(8193),
    headers: { 'content-length': '1' },
  });
  await assert.rejects(readBoundedJson(large), /request_too_large/);
});

test('limiter hashes are keyed and contain no raw username or IP', async () => {
  const first = await privateHash('username:alice', 'server-secret-one');
  const second = await privateHash('username:alice', 'server-secret-two');
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(first.includes('alice'), false);
  assert.equal(
    rateLimitAddress(new Headers({ 'x-forwarded-for': 'spoofed, 192.0.2.5' })),
    '192.0.2.5',
  );
  assert.equal(rateLimitAddress(new Headers({ 'x-forwarded-for': 'not an IP' })), 'unknown');
});

function setup(overrides: Partial<LoginBackend> = {}) {
  const calls: string[] = [];
  const backend: LoginBackend = {
    async allowLogin(usernameHash, ipHash) {
      assert.match(usernameHash, /^[a-f0-9]{64}$/);
      assert.match(ipHash, /^[a-f0-9]{64}$/);
      calls.push('limit');
      return true;
    },
    async findEmail(username) {
      calls.push(`lookup:${username}`);
      return 'private-email@example.test';
    },
    async verifyPassword(email, password) {
      calls.push(`verify:${email}:${password}`);
      return { access_token: 'access', refresh_token: 'refresh' };
    },
    ...overrides,
  };
  const handler = createLoginHandler({
    origins: allowedOrigins('https://madar.pages.dev'),
    secretKey: 'server-only-test-key',
    configured: true,
    createBackend: () => backend,
  });
  const request = (identifier = 'alice', password = 'correct') =>
    new Request('https://example.test/functions/v1/username-login', {
      method: 'POST',
      headers: { origin: 'https://madar.pages.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
  return { calls, handler, request };
}

test('successful login returns tokens only, never the resolved email or service key', async () => {
  const { calls, handler, request } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' });
  assert.deepEqual(calls, ['limit', 'lookup:alice', 'verify:private-email@example.test:correct']);
});

test('unknown username and wrong password receive identical generic 401 responses', async () => {
  const unknown = setup({
    async findEmail() {
      return null;
    },
    async verifyPassword(email) {
      assert.match(email, /^missing-[a-f0-9]{64}@invalid\.example$/);
      return null;
    },
  });
  const wrong = setup({
    async verifyPassword() {
      return null;
    },
  });
  const unknownResponse = await unknown.handler(unknown.request());
  const wrongResponse = await wrong.handler(wrong.request());
  assert.equal(unknownResponse.status, 401);
  assert.equal(wrongResponse.status, 401);
  assert.deepEqual(await unknownResponse.json(), await wrongResponse.json());
});

test('rate limit rejection occurs before private profile lookup or password verification', async () => {
  const { calls, handler, request } = setup({
    async allowLogin() {
      calls.push('blocked');
      return false;
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.deepEqual(calls, ['blocked']);
});

test('backend failure is fail-closed and suppresses sensitive exception text', async () => {
  const { handler, request } = setup({
    async allowLogin() {
      throw new Error('private-email@example.test secret-key password');
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'login_temporarily_unavailable' });
});

test('unsupported origin and malformed credentials never reach the backend', async () => {
  const { calls, handler, request } = setup();
  const badOrigin = new Request(request(), { headers: { origin: 'https://evil.test' } });
  const rejected = await handler(badOrigin);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  assert.equal((await handler(request('invalid user'))).status, 400);
  assert.deepEqual(calls, []);
});

test('preflight is anonymous but missing server configuration cannot sign anyone in', async () => {
  const handler = createLoginHandler({
    origins: allowedOrigins('https://madar.pages.dev'),
    secretKey: undefined,
    configured: false,
    createBackend() {
      throw new Error('backend should not be created');
    },
  });
  const preflight = await handler(
    new Request('https://example.test', {
      method: 'OPTIONS',
      headers: { origin: 'https://madar.pages.dev' },
    }),
  );
  assert.equal(preflight.status, 204);
  const { request } = setup();
  assert.equal((await handler(request())).status, 503);
});
