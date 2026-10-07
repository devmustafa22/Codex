import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { parseAccountAccess, readAccountAccess } from './account-access';

const session = {
  access_token: 'captured-account-jwt',
  user: { id: 'owner-id', user_metadata: { role: 'admin' } },
} as unknown as Session;

function backend(result: unknown) {
  const request = {
    setHeader: vi.fn(() => request),
    abortSignal: vi.fn(async () => result),
  };
  const rpc = vi.fn(() => request);
  return { client: { rpc } as unknown as SupabaseClient, rpc, request };
}

describe('server account access', () => {
  it('captures the signed-in token rather than trusting editable user metadata', async () => {
    const fake = backend({ data: { role: 'user', status: 'active' }, error: null });
    const signal = new AbortController().signal;
    await expect(readAccountAccess(fake.client, session, signal)).resolves.toEqual({
      role: 'user',
      status: 'active',
    });
    expect(fake.rpc).toHaveBeenCalledWith('get_account_access');
    expect(fake.request.setHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer captured-account-jwt',
    );
    expect(fake.request.abortSignal).toHaveBeenCalledWith(signal);
  });

  it.each(['active', 'suspended', 'deleted'] as const)(
    'preserves server account status %s',
    (status) => {
      expect(parseAccountAccess({ role: 'user', status })).toEqual({ role: 'user', status });
    },
  );

  it.each([
    null,
    [],
    { role: 'admin' },
    { role: 'member', status: 'active' },
    { role: ['admin'], status: 'active' },
    { role: 'admin', status: ['active'] },
    { role: 'admin', status: 'unknown' },
    { role: 'owner', status: 'active' },
  ])('rejects malformed or invented access data %j', (value) => {
    expect(() => parseAccountAccess(value)).toThrow();
  });

  it.each(['PGRST202', '42883'])(
    'allows only user access during an explicit old migration rollout (%s)',
    async (code) => {
      const fake = backend({
        data: null,
        error: { code, message: 'Function public.get_account_access not found' },
      });
      await expect(
        readAccountAccess(fake.client, session, new AbortController().signal),
      ).resolves.toEqual({ role: 'user', status: 'active' });
    },
  );

  it.each([
    { code: '42501', message: 'permission denied' },
    { code: 'PGRST202', message: 'Function another_rpc not found' },
    { code: '', message: 'Failed to fetch' },
    { code: '403', message: 'forbidden' },
  ])('does not fall back on authorization or network errors %j', async (error) => {
    const fake = backend({ data: null, error });
    await expect(
      readAccountAccess(fake.client, session, new AbortController().signal),
    ).rejects.toThrow();
  });
});
