import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminApi, parseAccountList } from './admin';
import type { ManagedAccount } from './admin';

const actor = '11111111-1111-4111-8111-111111111111';
const account: ManagedAccount = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'test_user',
  displayName: 'حساب اختبار',
  email: 'user@example.com',
  status: 'active',
  role: 'user',
  createdAt: '2026-10-07T10:00:00.000Z',
  lastSignInAt: null,
  emailConfirmed: false,
};
const listing = () => ({
  accounts: [account],
  total: 1,
  page: 1,
  pageSize: 20,
  stats: { total: 1, active: 1, suspended: 0, admins: 0 },
});

function fakeClient() {
  const invoke = vi.fn(async () => ({ data: listing() as unknown, error: null as unknown }));
  const getSession = vi.fn(async () => ({
    data: { session: { user: { id: actor }, access_token: 'captured-user-session' } },
    error: null,
  }));
  const client = { auth: { getSession }, functions: { invoke } } as unknown as SupabaseClient;
  return { client, invoke, getSession, api: createAdminApi(client, actor) };
}

describe('account administration response validation', () => {
  it('accepts the documented server list without inventing permissions', () => {
    expect(parseAccountList(listing())).toEqual(listing());
  });

  it.each([
    null,
    {},
    { ...listing(), accounts: [{ ...account, role: 'owner' }] },
    { ...listing(), accounts: [{ ...account, status: 'deleted' }] },
    { ...listing(), accounts: [{ ...account, emailConfirmed: 'yes' }] },
    { ...listing(), accounts: [{ ...account, createdAt: 'invalid-date' }] },
    { ...listing(), accounts: [account, account], total: 2 },
    { ...listing(), page: 0 },
    { ...listing(), pageSize: 0 },
    { ...listing(), stats: { total: 1, active: 0, suspended: 0, admins: 0 } },
    { ...listing(), stats: { total: 1, active: 1, suspended: 0, admins: 2 } },
  ])('rejects malformed or contradictory account data', (response) => {
    expect(() => parseAccountList(response)).toThrow();
  });
});

describe('account-bound admin client', () => {
  it('sends only the signed-in actor session and paginated server-side search', async () => {
    const { api, invoke } = fakeClient();
    await api.list({ search: ' user@example.com ', status: 'suspended', page: 3 });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('account-admin', {
      body: {
        action: 'list',
        search: 'user@example.com',
        status: 'suspended',
        page: 3,
        pageSize: 20,
      },
      headers: { Authorization: 'Bearer captured-user-session' },
    });
  });

  it('stops before sending an admin request after the signed-in account changes', async () => {
    const { api, invoke, getSession } = fakeClient();
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'different-account' }, access_token: 'different-session' } },
      error: null,
    });
    await expect(api.list({ search: '', status: 'all', page: 1 })).rejects.toMatchObject({
      code: 'session_changed',
      status: 401,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    { ...account, id: actor },
    { ...account, role: 'admin' as const },
  ])('protects self and admins before issuing a mutation', async (protectedAccount) => {
    const { api, invoke } = fakeClient();
    await expect(api.manage('suspend', protectedAccount)).rejects.toMatchObject({
      code: 'protected_account',
    });
    await expect(
      api.manage('delete', protectedAccount, protectedAccount.username),
    ).rejects.toMatchObject({ code: 'protected_account' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires the exact username and does not send a deletion for approximate confirmation', async () => {
    const { api, invoke } = fakeClient();
    await expect(api.manage('delete', account, 'test_user ')).rejects.toMatchObject({
      code: 'confirmation_mismatch',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires mutation acknowledgements to match the target and resulting state', async () => {
    const { api, invoke } = fakeClient();
    invoke.mockResolvedValueOnce({
      data: { account: { id: account.id, username: account.username, status: 'active' } },
      error: null,
    });
    await expect(api.manage('suspend', account)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    invoke.mockResolvedValueOnce({
      data: { deleted: true, targetId: 'different-account' },
      error: null,
    });
    await expect(api.manage('delete', account, account.username)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('accepts verified suspend and deletion acknowledgements', async () => {
    const { api, invoke } = fakeClient();
    invoke.mockResolvedValueOnce({
      data: { account: { id: account.id, username: account.username, status: 'suspended' } },
      error: null,
    });
    await expect(api.manage('suspend', account)).resolves.toBeUndefined();
    invoke.mockResolvedValueOnce({ data: { deleted: true, targetId: account.id }, error: null });
    await expect(api.manage('delete', account, account.username)).resolves.toBeUndefined();
    expect(invoke.mock.calls[1]).toEqual([
      'account-admin',
      {
        body: { action: 'delete', userId: account.id, confirmation: account.username },
        headers: { Authorization: 'Bearer captured-user-session' },
      },
    ]);
  });

  it('translates HTTP authorization errors without exposing private server messages', async () => {
    const { api, invoke } = fakeClient();
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ code: 'admin_required', message: 'secret database query contents' }),
          { status: 403 },
        ),
      },
    });
    await expect(api.list({ search: '', status: 'all', page: 1 })).rejects.toMatchObject({
      code: 'admin_required',
      status: 403,
      message: 'حسابك لا يملك صلاحية إدارة الحسابات أو تم إيقافه.',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('reports completed deletion even when the server audit write fails', async () => {
    const { api, invoke } = fakeClient();
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: 'account_deleted_audit_pending',
            deleted: true,
            targetId: account.id,
          }),
          { status: 503 },
        ),
      },
    });
    await expect(api.manage('delete', account, account.username)).rejects.toMatchObject({
      code: 'account_deleted_audit_pending',
      changedState: 'deleted',
      status: 503,
    });
  });

  it.each([
    {
      code: 'account_action_pending',
      pending: 'status',
      retryAfterSeconds: 900,
      message: 'انتظر 15 دقيقة',
    },
    {
      code: 'account_status_confirmation_pending',
      pending: 'status',
      retryAfterSeconds: 900,
      message: 'تعذّر تأكيد الحالة النهائية',
    },
    {
      code: 'account_delete_unknown',
      pending: 'delete',
      retryAfterSeconds: null,
      message: 'ولا تكرر العملية قبل التحقق من وجود الحساب داخل Supabase',
    },
  ])(
    'keeps unknown $code outcomes pending without claiming the mutation completed or retrying',
    async ({ code, pending, retryAfterSeconds, message }) => {
      const { api, invoke } = fakeClient();
      invoke.mockResolvedValueOnce({
        data: null,
        error: {
          context: new Response(
            JSON.stringify({
              error: code,
              pending: true,
              retryable: pending !== 'delete',
              targetId: account.id,
              ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
            }),
            { status: 503 },
          ),
        },
      });
      let result: unknown;
      try {
        await api.manage(pending === 'delete' ? 'delete' : 'suspend', account, account.username);
      } catch (error) {
        result = error;
      }
      expect(result).toMatchObject({
        code,
        status: 503,
        pending,
        retryAfterSeconds,
        changedState: null,
      });
      expect((result as Error).message).toContain(message);
      expect((result as Error).message).not.toContain('تم حذف');
      expect((result as Error).message).not.toContain('حاول مجدداً بعد قليل');
      expect(invoke).toHaveBeenCalledTimes(1);
    },
  );

  it('does not fall back to direct profile reads after network failure', async () => {
    const { api, invoke, client } = fakeClient();
    const from = vi.fn();
    client.from = from;
    invoke.mockRejectedValueOnce(new Error('private error context'));
    await expect(api.list({ search: '', status: 'all', page: 1 })).rejects.toMatchObject({
      status: null,
      code: 'request_failed',
    });
    expect(from).not.toHaveBeenCalled();
  });
});
