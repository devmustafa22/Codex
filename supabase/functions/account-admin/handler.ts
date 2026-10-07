import {
  AdminBackendError,
  DefiniteAuthFailure,
  bearerToken,
  parseAdminRequest,
  readBoundedJson,
  responseHeaders,
} from './helpers.ts';
import type { AccountStatus, AdminRequest } from './helpers.ts';

export interface ManagedAccount {
  id: string;
  username: string;
  status: AccountStatus;
}

export interface AccountList {
  accounts: Array<
    ManagedAccount & {
      displayName: string;
      email: string;
      role: 'user' | 'admin';
      createdAt: string;
      lastSignInAt: string | null;
      emailConfirmed: boolean;
    }
  >;
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; active: number; suspended: number; admins: number };
}

export interface DeleteOperation {
  operationId: string;
  targetId: string;
  username: string;
}
export interface StatusOperation extends DeleteOperation {
  status: AccountStatus;
}

export interface AdminBackend {
  authenticate(token: string): Promise<string | null>;
  listAccounts(
    actorId: string,
    request: Extract<AdminRequest, { action: 'list' }>,
  ): Promise<AccountList>;
  beginStatus(actorId: string, targetId: string, status: AccountStatus): Promise<StatusOperation>;
  completeStatus(
    actorId: string,
    operationId: string,
  ): Promise<{ targetId: string; status: AccountStatus }>;
  failStatus(actorId: string, operationId: string): Promise<void>;
  banAccount(targetId: string): Promise<void>;
  unbanAccount(targetId: string): Promise<void>;
  prepareDelete(actorId: string, targetId: string, confirmation: string): Promise<DeleteOperation>;
  deleteAccount(targetId: string): Promise<void>;
  completeDelete(actorId: string, operationId: string): Promise<void>;
  failDelete(actorId: string, operationId: string): Promise<void>;
}

interface Dependencies {
  origins: Set<string>;
  configured: boolean;
  createBackend(): AdminBackend;
}

export function createAdminHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = responseHeaders(origin, dependencies.origins);
    const respond = (status: number, payload: Record<string, unknown>) =>
      new Response(JSON.stringify(payload), { status, headers });
    if (origin && !dependencies.origins.has(origin))
      return respond(403, { error: 'origin_not_allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
    const token = bearerToken(request.headers.get('authorization'));
    if (!token) return respond(401, { error: 'authentication_required' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return respond(400, { error: 'invalid_request' });
    if (!dependencies.configured) return respond(503, { error: 'admin_temporarily_unavailable' });
    let input: AdminRequest | null;
    try {
      input = parseAdminRequest(await readBoundedJson(request));
    } catch {
      return respond(400, { error: 'invalid_request' });
    }
    if (!input) return respond(400, { error: 'invalid_request' });

    try {
      const backend = dependencies.createBackend();
      // Auth validates this token against the current account. Neither JWT
      // claims nor body fields nor editable user metadata establish a role.
      const actorId = await backend.authenticate(token);
      if (!actorId) return respond(401, { error: 'authentication_required' });
      if (input.action === 'list')
        return respond(200, { ...(await backend.listAccounts(actorId, input)) });
      if (input.action === 'suspend' || input.action === 'reactivate') {
        // The private durable operation serializes changes for this account.
        // Both paths deny database access before the external Auth operation.
        const status = input.action === 'suspend' ? 'suspended' : 'active';
        const operation = await backend.beginStatus(actorId, input.userId, status);
        try {
          if (status === 'suspended') await backend.banAccount(operation.targetId);
          else await backend.unbanAccount(operation.targetId);
        } catch (error) {
          if (!(error instanceof DefiniteAuthFailure)) {
            // A lost response cannot prove that Auth rejected the operation.
            // Keep the reservation so a late response cannot overlap a retry.
            return respond(503, {
              error: 'account_action_pending',
              retryable: true,
              pending: true,
              retryAfterSeconds: 900,
              account: {
                id: operation.targetId,
                username: operation.username,
                status: 'suspended',
              },
            });
          }
          await backend.failStatus(actorId, operation.operationId).catch(() => undefined);
          return respond(503, {
            error:
              status === 'suspended'
                ? 'account_suspended_auth_pending'
                : 'account_reactivation_failed',
            retryable: true,
            account: { id: operation.targetId, username: operation.username, status: 'suspended' },
          });
        }
        try {
          // SQL rechecks current admin privileges when completing the action.
          const completed = await backend.completeStatus(actorId, operation.operationId);
          return respond(200, {
            account: {
              id: completed.targetId,
              username: operation.username,
              status: completed.status,
            },
          });
        } catch (error) {
          if (error instanceof AdminBackendError && error.code === 'admin_required') {
            await backend.failStatus(actorId, operation.operationId).catch(() => undefined);
            return respond(503, {
              error:
                status === 'suspended'
                  ? 'account_suspended_auth_pending'
                  : 'account_reactivation_failed',
              retryable: true,
              account: {
                id: operation.targetId,
                username: operation.username,
                status: 'suspended',
              },
            });
          }
          // A missing SQL response may follow a committed transaction. Do not
          // invent an account state or claim that finalization definitely failed.
          return respond(503, {
            error: 'account_status_confirmation_pending',
            retryable: true,
            pending: true,
            retryAfterSeconds: 900,
            targetId: operation.targetId,
          });
        }
      }
      if (input.action !== 'delete') return respond(400, { error: 'invalid_request' });
      const operation = await backend.prepareDelete(actorId, input.userId, input.confirmation);
      try {
        await backend.deleteAccount(operation.targetId);
      } catch (error) {
        if (!(error instanceof DefiniteAuthFailure)) {
          return respond(503, {
            error: 'account_delete_unknown',
            retryable: false,
            pending: true,
            targetId: operation.targetId,
          });
        }
        // Preparation is durable and denies data access even if Auth is down.
        // An audit failure leaves the original pending record rather than
        // incorrectly claiming the account was removed.
        await backend.failDelete(actorId, operation.operationId).catch(() => undefined);
        return respond(503, { error: 'account_delete_failed', retryable: true, suspended: true });
      }
      try {
        await backend.completeDelete(actorId, operation.operationId);
      } catch {
        return respond(503, {
          error: 'account_deleted_audit_pending',
          deleted: true,
          retryable: false,
          targetId: operation.targetId,
        });
      }
      return respond(200, { deleted: true, targetId: operation.targetId });
    } catch (error) {
      const code =
        error instanceof AdminBackendError ? error.code : 'admin_temporarily_unavailable';
      const statuses: Record<string, number> = {
        admin_required: 403,
        protected_admin: 409,
        account_not_found: 404,
        delete_in_progress: 409,
        account_action_in_progress: 409,
        invalid_confirmation: 400,
        invalid_status: 400,
        invalid_pagination: 400,
        invalid_search: 400,
      };
      return respond(statuses[code] ?? 503, {
        error: code in statuses ? code : 'admin_temporarily_unavailable',
      });
    }
  };
}
