import { createClient, isAuthApiError } from 'npm:@supabase/supabase-js@2.117.2';
import { allowedOrigins } from '../username-login/helpers.ts';
import { adminRpcError, DefiniteAuthFailure } from './helpers.ts';
import type { AccountStatus } from './helpers.ts';
import { createAdminHandler } from './handler.ts';
import type { AccountList, DeleteOperation, StatusOperation } from './handler.ts';

function injectedKey(mapName: string, legacyName: string): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get(mapName) ?? '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    /* Older projects inject individual variables. */
  }
  return Deno.env.get(legacyName);
}

const projectUrl = Deno.env.get('SUPABASE_URL');
const secretKey = injectedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');

const boundedFetch: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });

function throwAuthFailure(error: unknown): never {
  // A received Auth HTTP error is definite rejection. Timeout, fetch failure
  // or unrecognized SDK errors are ambiguous and retain the SQL reservation.
  if (isAuthApiError(error)) throw new DefiniteAuthFailure();
  throw new Error('auth_result_unknown');
}

const handler = createAdminHandler({
  origins: allowedOrigins(Deno.env.get('ALLOWED_ORIGINS')),
  configured: Boolean(projectUrl && secretKey),
  createBackend() {
    // Never reuse a client whose auth state could change between requests.
    const admin = createClient(projectUrl!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: boundedFetch },
    });
    async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
      const { data, error } = await admin.rpc(name, parameters);
      if (error) throw adminRpcError(error);
      if (!data) throw new Error('admin_unavailable');
      return data as T;
    }
    return {
      async authenticate(token) {
        const { data, error } = await admin.auth.getUser(token);
        if (error) {
          if (
            isAuthApiError(error) &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 429
          )
            return null;
          throw new Error('auth_validation_unavailable');
        }
        if (!data.user) return null;
        return data.user.id;
      },
      listAccounts(actorId, input) {
        return rpc<AccountList>('admin_list_accounts', {
          p_actor_id: actorId,
          p_page: input.page,
          p_page_size: input.pageSize,
          p_search: input.search,
          p_status: input.status,
        });
      },
      beginStatus(actorId, targetId, status: AccountStatus) {
        return rpc<StatusOperation>('admin_begin_account_status', {
          p_actor_id: actorId,
          p_target_id: targetId,
          p_status: status,
        });
      },
      completeStatus(actorId, operationId) {
        return rpc<{ targetId: string; status: AccountStatus }>('admin_complete_account_status', {
          p_actor_id: actorId,
          p_operation_id: operationId,
        });
      },
      async failStatus(actorId, operationId) {
        await rpc('admin_fail_account_status', {
          p_actor_id: actorId,
          p_operation_id: operationId,
          p_error_code: 'auth_status_update_failed',
        });
      },
      async banAccount(targetId) {
        const { error } = await admin.auth.admin.updateUserById(targetId, {
          ban_duration: '87600h',
        });
        if (error) throwAuthFailure(error);
      },
      async unbanAccount(targetId) {
        const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: 'none' });
        if (error) throwAuthFailure(error);
      },
      prepareDelete(actorId, targetId, confirmation) {
        return rpc<DeleteOperation>('admin_prepare_account_delete', {
          p_actor_id: actorId,
          p_target_id: targetId,
          p_confirmation: confirmation,
        });
      },
      async deleteAccount(targetId) {
        const { error } = await admin.auth.admin.deleteUser(targetId, false);
        if (error) throwAuthFailure(error);
      },
      async completeDelete(actorId, operationId) {
        await rpc('admin_complete_account_delete', {
          p_actor_id: actorId,
          p_operation_id: operationId,
        });
      },
      async failDelete(actorId, operationId) {
        await rpc('admin_fail_account_delete', {
          p_actor_id: actorId,
          p_operation_id: operationId,
          p_error_code: 'auth_delete_failed',
        });
      },
    };
  },
});

Deno.serve(handler);
