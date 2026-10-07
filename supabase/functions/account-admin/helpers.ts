import { readBoundedJson, responseHeaders } from '../username-login/helpers.ts';

export { readBoundedJson, responseHeaders };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export type AccountStatus = 'active' | 'suspended';
export type AdminRequest =
  | {
      action: 'list';
      page: number;
      pageSize: number;
      search: string;
      status: AccountStatus | 'all';
    }
  | { action: 'suspend' | 'reactivate'; userId: string }
  | { action: 'delete'; userId: string; confirmation: string };

export function bearerToken(header: string | null): string | null {
  if (!header || header.length > 8192) return null;
  const match = /^Bearer ([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function parseAdminRequest(input: unknown): AdminRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.action !== 'string') return null;
  if (value.action === 'list') {
    if (
      Object.keys(value).some(
        (key) => !['action', 'page', 'pageSize', 'search', 'status'].includes(key),
      )
    )
      return null;
    const page = value.page === undefined ? 1 : value.page;
    const pageSize = value.pageSize === undefined ? 20 : value.pageSize;
    const search = value.search === undefined ? '' : value.search;
    const status = value.status === undefined ? 'all' : value.status;
    if (
      typeof page !== 'number' ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      typeof pageSize !== 'number' ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50 ||
      typeof search !== 'string' ||
      search.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(search) ||
      typeof status !== 'string' ||
      !['all', 'active', 'suspended'].includes(status)
    )
      return null;
    return {
      action: 'list',
      page,
      pageSize,
      search: search.trim(),
      status: status as AccountStatus | 'all',
    };
  }
  if (!['suspend', 'reactivate', 'delete'].includes(value.action)) return null;
  const keys =
    value.action === 'delete' ? ['action', 'userId', 'confirmation'] : ['action', 'userId'];
  if (Object.keys(value).some((key) => !keys.includes(key))) return null;
  if (typeof value.userId !== 'string' || !UUID_PATTERN.test(value.userId)) return null;
  if (value.action === 'delete') {
    if (typeof value.confirmation !== 'string' || !ADMIN_USERNAME_PATTERN.test(value.confirmation))
      return null;
    return { action: 'delete', userId: value.userId, confirmation: value.confirmation };
  }
  return { action: value.action as 'suspend' | 'reactivate', userId: value.userId };
}

export class AdminBackendError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'AdminBackendError';
  }
}

export class DefiniteAuthFailure extends Error {
  constructor() {
    super('auth_operation_rejected');
    this.name = 'DefiniteAuthFailure';
  }
}

export function adminRpcError(error: { message?: string; code?: string }): AdminBackendError {
  const recognized = [
    'admin_required',
    'protected_admin',
    'account_not_found',
    'delete_in_progress',
    'account_action_in_progress',
    'invalid_confirmation',
    'invalid_status',
    'invalid_pagination',
    'invalid_search',
  ];
  const code = recognized.find((candidate) => error.message === candidate);
  return new AdminBackendError(code ?? 'admin_temporarily_unavailable');
}
