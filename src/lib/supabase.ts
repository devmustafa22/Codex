import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

// Capture callback intent before the SDK removes its code from the address bar.
// Intent alone cannot certify recovery: the SDK must verify the recovery session.
const callbackQuery = new URLSearchParams(window.location.search);
const callbackHash = new URLSearchParams(window.location.hash.slice(1));
const recoveryCallback = {
  requested: callbackQuery.get('auth') === 'recovery' || callbackHash.get('type') === 'recovery',
  verifiedUserId: null as string | null,
};

export function recoveryCallbackState() {
  return { ...recoveryCallback };
}

export function clearRecoveryCallback() {
  recoveryCallback.requested = false;
  recoveryCallback.verifiedUserId = null;
}

function inspectConfiguration(): string {
  if (!url || !key)
    return 'أضف رابط مشروع Supabase ومفتاحه العام حتى يتفعّل تسجيل الدخول والحفظ السحابي.';
  if (/YOUR_PROJECT|YOUR_PUBLIC_KEY/i.test(`${url} ${key}`)) {
    return 'استبدل القيم المثال في .env.local برابط مشروعك ومفتاحه العام، ثم أعد تشغيل المشروع.';
  }
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
      return 'رابط Supabase يجب أن يبدأ بـ https://.';
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return 'استخدم رابط المشروع من إعدادات Supabase بدون بيانات دخول أو معاملات إضافية.';
    }
    if (key.startsWith('sb_secret_')) {
      return 'هذا مفتاح سرّي. استخدم Publishable key العام، واحذف المفتاح السرّي من إعدادات الواجهة.';
    }
    if (!key.startsWith('sb_publishable_')) {
      const payload = key.split('.')[1];
      if (!payload) return 'المفتاح غير صحيح. استخدم Publishable key أو مفتاح anon العام.';
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (decoded.role !== 'anon') {
        return 'الواجهة تقبل المفتاح العام فقط. لا تستخدم service_role أو أي مفتاح سرّي.';
      }
    }
    return '';
  } catch {
    return 'تعذّر قراءة إعدادات Supabase. تأكد من رابط المشروع ومفتاحه العام.';
  }
}

export const configurationIssue = inspectConfiguration();
export const supabase: SupabaseClient | null = configurationIssue
  ? null
  : createClient(url, key, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'madar:auth',
      },
    });

// Register immediately, before React mounts. SDK callback events may precede the provider.
supabase?.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    recoveryCallback.requested = true;
    recoveryCallback.verifiedUserId = session.user.id;
  }
  if (event === 'SIGNED_OUT') recoveryCallback.verifiedUserId = null;
});
