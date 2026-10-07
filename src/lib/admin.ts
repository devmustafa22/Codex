import { t } from './i18n';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ManagedAccount = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: 'active' | 'suspended';
  role: 'admin' | 'user';
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
};

export type AccountList = {
  accounts: ManagedAccount[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; active: number; suspended: number; admins: number };
};

export type AccountFilter = 'all' | 'active' | 'suspended';
export type AccountAction = 'suspend' | 'reactivate' | 'delete';

export class AdminError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
    readonly changedState: 'suspended' | 'deleted' | null = null,
    readonly pending: 'status' | 'delete' | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validStats(value: unknown): value is AccountList['stats'] {
  return (
    record(value) && ['total', 'active', 'suspended', 'admins'].every((key) => count(value[key]))
  );
}

function validAccount(value: unknown): value is ManagedAccount {
  if (!record(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.username === 'string' &&
    /^[a-z0-9_]{3,24}$/.test(value.username) &&
    typeof value.displayName === 'string' &&
    (value.email === null || typeof value.email === 'string') &&
    (value.status === 'active' || value.status === 'suspended') &&
    (value.role === 'user' || value.role === 'admin') &&
    timestamp(value.createdAt) &&
    (value.lastSignInAt === null || timestamp(value.lastSignInAt)) &&
    typeof value.emailConfirmed === 'boolean'
  );
}

export function parseAccountList(value: unknown): AccountList {
  if (
    !record(value) ||
    !Array.isArray(value.accounts) ||
    !value.accounts.every(validAccount) ||
    !count(value.total) ||
    !count(value.page) ||
    value.page < 1 ||
    !count(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 100 ||
    value.accounts.length > value.pageSize ||
    value.total < value.accounts.length ||
    !validStats(value.stats)
  ) {
    throw new AdminError(t('auth.adminListInvalid'), 'invalid_response');
  }
  if (
    new Set(value.accounts.map((account) => account.id)).size !== value.accounts.length ||
    (value.stats.active as number) + (value.stats.suspended as number) !== value.stats.total ||
    (value.stats.admins as number) > (value.stats.total as number)
  ) {
    throw new AdminError(t('auth.adminListInvalid'), 'invalid_response');
  }
  return value as AccountList;
}

function errorMessage(status: number | null, code: string) {
  if (
    status === 401 ||
    ['session_changed', 'unauthorized', 'invalid_session', 'authentication_required'].includes(code)
  ) {
    return t('auth.adminSessionChanged');
  }
  if (status === 403 || ['forbidden', 'admin_required', 'account_suspended'].includes(code)) {
    return t('auth.adminAccessDenied');
  }
  if (
    ['protected_account', 'protected_admin', 'cannot_manage_admin', 'cannot_manage_self'].includes(
      code,
    )
  ) {
    return t('auth.adminProtected');
  }
  if (status === 404 || code === 'account_not_found') {
    return t('auth.adminAccountMissing');
  }
  if (['confirmation_required', 'confirmation_mismatch', 'invalid_confirmation'].includes(code)) {
    return t('auth.adminConfirmation');
  }
  if (status === 429 || code === 'rate_limited') {
    return t('auth.adminRateLimit');
  }
  if (code === 'account_suspended_auth_pending') {
    return t('auth.adminSuspendPartial');
  }
  if (code === 'account_reactivation_failed') {
    return t('auth.adminReactivateFailed');
  }
  if (code === 'account_delete_failed') {
    return t('auth.adminDeleteFailed');
  }
  if (code === 'account_deleted_audit_pending') {
    return t('auth.adminDeleteAuditPending');
  }
  if (code === 'account_action_pending') {
    return t('auth.adminActionPending');
  }
  if (code === 'account_status_confirmation_pending') {
    return t('auth.adminStatusPending');
  }
  if (code === 'account_delete_unknown' || code === 'delete_in_progress') {
    return t('auth.adminDeleteUnknown');
  }
  if (status === 409) {
    return t('auth.adminStateChanged');
  }
  if (status === null) return t('auth.adminConnectionFailed');
  if (status >= 500) return t('auth.adminServerError');
  return t('auth.adminOperationFailed');
}

async function parseInvocationError(error: unknown): Promise<AdminError> {
  const context = record(error) ? error.context : null;
  const response = context instanceof Response ? context : null;
  const status = response?.status ?? null;
  let code = 'request_failed';
  let changedState: 'suspended' | 'deleted' | null = null;
  let pending: 'status' | 'delete' | null = null;
  if (response) {
    try {
      const body: unknown = await response.clone().json();
      if (record(body)) {
        if (typeof body.code === 'string') code = body.code;
        else if (typeof body.error === 'string') code = body.error;
        if (code === 'account_deleted_audit_pending' && body.deleted === true)
          changedState = 'deleted';
        if (code === 'account_delete_failed' && body.suspended === true) changedState = 'suspended';
        if (code === 'account_suspended_auth_pending') changedState = 'suspended';
        if (
          ['account_action_pending', 'account_status_confirmation_pending'].includes(code) &&
          body.pending === true
        ) {
          pending = 'status';
        }
        if (code === 'account_delete_unknown' && body.pending === true) pending = 'delete';
      }
    } catch {
      // Only known status/code translations reach the UI, never raw server details.
    }
  }
  if (code === 'delete_in_progress') pending = 'delete';
  return new AdminError(
    errorMessage(status, code),
    code,
    status,
    changedState,
    pending,
    pending === 'status' ? 900 : null,
  );
}

/** The UI never reads profiles directly or falls back to public account data. */
export function createAdminApi(client: SupabaseClient, actorUserId: string) {
  async function invoke(body: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.auth.getSession();
    const session = data.session;
    if (error || !session || session.user.id !== actorUserId) {
      throw new AdminError(errorMessage(401, 'session_changed'), 'session_changed', 401);
    }
    let response;
    try {
      response = await client.functions.invoke('account-admin', {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (error) {
      throw await parseInvocationError(error);
    }
    if (response.error) throw await parseInvocationError(response.error);
    if (record(response.data) && response.data.error) {
      throw new AdminError(errorMessage(null, String(response.data.error)), 'invalid_response');
    }
    return response.data;
  }

  return {
    async list({ search, status, page }: { search: string; status: AccountFilter; page: number }) {
      const data = await invoke({
        action: 'list',
        search: search.trim(),
        status,
        page,
        pageSize: 20,
      });
      return parseAccountList(data);
    },
    async manage(action: AccountAction, account: ManagedAccount, confirmation?: string) {
      if (account.id === actorUserId || account.role === 'admin') {
        throw new AdminError(errorMessage(409, 'protected_account'), 'protected_account', 409);
      }
      if (action === 'delete' && confirmation !== account.username) {
        throw new AdminError(
          errorMessage(400, 'confirmation_mismatch'),
          'confirmation_mismatch',
          400,
        );
      }
      const result = await invoke({
        action,
        userId: account.id,
        ...(confirmation ? { confirmation } : {}),
      });
      const successful =
        record(result) &&
        (action === 'delete'
          ? result.deleted === true && result.targetId === account.id
          : record(result.account) &&
            result.account.id === account.id &&
            result.account.username === account.username &&
            result.account.status === (action === 'suspend' ? 'suspended' : 'active'));
      if (!successful) {
        throw new AdminError(t('auth.adminUnconfirmed'), 'invalid_response');
      }
    },
  };
}
