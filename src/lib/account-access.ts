import type { Session, SupabaseClient } from '@supabase/supabase-js';

export interface AccountAccess {
  role: 'admin' | 'user';
  status: 'active' | 'suspended' | 'deleted';
}

export function parseAccountAccess(value: unknown): AccountAccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('تعذّر تأكيد صلاحيات الحساب. أعد المحاولة.');
  }
  const access = value as Record<string, unknown>;
  if (
    (access.role !== 'admin' && access.role !== 'user') ||
    (access.status !== 'active' && access.status !== 'suspended' && access.status !== 'deleted')
  ) {
    throw new Error('تعذّر تأكيد صلاحيات الحساب. أعد المحاولة.');
  }
  return {
    role: access.role,
    status: access.status,
  };
}

/** Bind the check to the captured JWT, even if another tab changes the SDK session. */
export async function readAccountAccess(
  client: SupabaseClient,
  session: Session,
  signal: AbortSignal,
): Promise<AccountAccess> {
  const { data, error } = await client
    .rpc('get_account_access')
    .setHeader('Authorization', `Bearer ${session.access_token}`)
    .abortSignal(signal);
  if (error) {
    // An older installation can keep its personal workspace during the rollout.
    // This fallback never grants admin access and doesn't cover network/permission failures.
    if (
      ['PGRST202', '42883'].includes(error.code) &&
      /get_account_access/i.test(`${error.message} ${error.details ?? ''}`)
    ) {
      return { role: 'user', status: 'active' };
    }
    throw new Error('تعذّر التحقق من حالة حسابك. تأكد من الاتصال ثم أعد المحاولة.');
  }
  return parseAccountAccess(data);
}
