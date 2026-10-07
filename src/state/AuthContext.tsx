import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearRecoveryCallback, recoveryCallbackState, supabase } from '../lib/supabase';

type SignupInput = { username: string; email: string; password: string; name: string };
type AuthContextValue = {
  mode: 'cloud' | 'demo' | 'signed-out';
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  recovery: boolean;
  recoveryVerified: boolean;
  enterDemo: () => void;
  leaveDemo: () => void;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (input: SignupInput) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_KEY = 'madar:demo';

function rememberDemo(value: boolean) {
  try {
    if (value) sessionStorage.setItem(DEMO_KEY, '1');
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // Browsers may deny storage; the current session can still use demo mode.
  }
}

function initialDemo() {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

function clearRecoveryLocation() {
  clearRecoveryCallback();
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('code');
  if (url.hash.includes('access_token') || url.hash.includes('type=recovery')) url.hash = '';
  window.history.replaceState({}, '', url);
}

function authError(error: { message?: string; code?: string } | null, fallback: string): Error {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return new Error('فعّل بريدك الإلكتروني من رسالة التأكيد قبل تسجيل الدخول.');
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return new Error('هذا البريد مسجّل مسبقاً. سجّل الدخول أو استرجع كلمة المرور.');
  }
  if (/username|database error saving new user/i.test(message)) {
    return new Error(
      'تعذّر إنشاء الحساب. جرّب اسم مستخدم آخر، وتأكد من تطبيق إعداد قاعدة البيانات.',
    );
  }
  if (code === 'same_password') return new Error('اختر كلمة مرور جديدة تختلف عن السابقة.');
  if (/rate|too[ _]many|429/i.test(`${code} ${message}`)) {
    return new Error('محاولات كثيرة خلال وقت قصير. انتظر دقائق قليلة ثم حاول مجدداً.');
  }
  if (/password|weak/i.test(`${code} ${message}`)) {
    return new Error('اختر كلمة مرور قوية من 10 أحرف على الأقل، مع حرف ورقم.');
  }
  if (/fetch|network|timeout|connection/i.test(message)) {
    return new Error('تعذّر الاتصال. تأكد من الإنترنت ثم حاول مجدداً.');
  }
  return new Error(fallback);
}

function assertPassword(password: string) {
  if (
    password.length < 10 ||
    password.length > 128 ||
    !/\p{L}/u.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error('كلمة المرور لازم تكون من 10 إلى 128 حرفاً، وبيها حرف ورقم.');
  }
}

function assertEmail(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('اكتب بريداً إلكترونياً صحيحاً.');
  }
}

function client() {
  if (!supabase) throw new Error('الحسابات غير مهيأة. أضف إعدادات Supabase أولاً.');
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [demo, setDemo] = useState(initialDemo);
  const [recovery, setRecovery] = useState(() => recoveryCallbackState().requested);
  const [recoveryVerified, setRecoveryVerified] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEvent = 0;
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEvent += 1;
      setSession(nextSession);
      setLoading(false);
      const verifiedUser = recoveryCallbackState().verifiedUserId;
      setRecoveryVerified(!!nextSession && verifiedUser === nextSession.user.id);
      if (nextSession) {
        setDemo(false);
        rememberDemo(false);
      }
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecoveryVerified(false);
    });
    const beforeSession = authEvent;
    void supabase.auth.getSession().then(
      ({ data: current }) => {
        if (!active || authEvent !== beforeSession) return;
        setSession(current.session);
        setRecoveryVerified(
          !!current.session && recoveryCallbackState().verifiedUserId === current.session.user.id,
        );
        if (current.session) {
          setDemo(false);
          rememberDemo(false);
        }
        setLoading(false);
      },
      () => {
        if (active) setLoading(false);
      },
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: session ? 'cloud' : demo ? 'demo' : 'signed-out',
      user: session?.user ?? null,
      session,
      loading,
      configured: !!supabase,
      recovery,
      recoveryVerified,
      enterDemo() {
        if (session) return;
        rememberDemo(true);
        setDemo(true);
        setRecovery(false);
        setRecoveryVerified(false);
        clearRecoveryLocation();
      },
      leaveDemo() {
        rememberDemo(false);
        setDemo(false);
      },
      async signIn(identifier, password) {
        const instance = client();
        const normalized = identifier.trim().toLowerCase();
        if (!normalized || !password) throw new Error('اكتب اسم المستخدم وكلمة المرور.');
        if (normalized.includes('@')) {
          assertEmail(normalized);
          const { error } = await instance.auth.signInWithPassword({ email: normalized, password });
          if (error) throw authError(error, 'تعذّر تسجيل الدخول. حاول مجدداً.');
        } else {
          if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
            throw new Error(
              'اسم المستخدم يتكوّن من 3 إلى 24 حرفاً إنكليزياً أو رقماً أو شرطة سفلية.',
            );
          }
          const { data, error } = await instance.functions.invoke('username-login', {
            body: { identifier: normalized, password },
          });
          if (error) {
            let response: { error?: string; code?: string } | null = null;
            if ('context' in error && error.context instanceof Response) {
              try {
                response = await error.context.json();
              } catch {
                // A failed gateway response may not contain JSON.
              }
            }
            throw authError(
              {
                code: response?.code ?? response?.error,
                message: response?.error ?? error.message,
              },
              'تعذّر تسجيل الدخول. تأكد من نشر دالة username-login أو جرّب بريدك الإلكتروني.',
            );
          }
          if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') {
            throw new Error('تعذّر تسجيل الدخول. تأكد من نشر دالة username-login.');
          }
          const { error: sessionError } = await instance.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          if (sessionError) throw authError(sessionError, 'تعذّر تثبيت جلسة الدخول. حاول مجدداً.');
        }
        setRecovery(false);
        setRecoveryVerified(false);
        clearRecoveryLocation();
      },
      async signUp(input) {
        const username = input.username.trim().toLowerCase();
        const email = input.email.trim().toLowerCase();
        const name = input.name.trim();
        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
          throw new Error(
            'اسم المستخدم: 3 إلى 24 حرفاً إنكليزياً أو رقماً أو شرطة سفلية، بدون مسافات.',
          );
        }
        if (!name || name.length > 80) throw new Error('اكتب اسمك، بحد أقصى 80 حرفاً.');
        assertEmail(email);
        assertPassword(input.password);
        const { data, error } = await client().auth.signUp({
          email,
          password: input.password,
          options: {
            data: { username, display_name: name },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        });
        if (error) throw authError(error, 'تعذّر إنشاء الحساب. حاول مجدداً.');
        return { confirmationRequired: !data.session };
      },
      async signOut() {
        // Local scope signs out this browser without interrupting other devices.
        if (supabase && session) {
          const { error } = await supabase.auth.signOut({ scope: 'local' });
          if (error) throw authError(error, 'تعذّر تسجيل الخروج. حاول مجدداً.');
        }
        rememberDemo(false);
        setDemo(false);
        setSession(null);
        setRecovery(false);
        setRecoveryVerified(false);
        clearRecoveryLocation();
      },
      async requestPasswordReset(email) {
        const normalized = email.trim().toLowerCase();
        assertEmail(normalized);
        const { error } = await client().auth.resetPasswordForEmail(normalized, {
          redirectTo: `${window.location.origin}${window.location.pathname}?auth=recovery`,
        });
        if (error) throw authError(error, 'تعذّر إرسال رسالة الاسترجاع. حاول مجدداً.');
      },
      async changePassword(password) {
        if (recovery && (!session || !recoveryVerified)) {
          throw new Error('رابط الاسترجاع غير صالح. اطلب رابطاً جديداً وافتحه بنفس المتصفح.');
        }
        assertPassword(password);
        const { error } = await client().auth.updateUser({ password });
        if (error) throw authError(error, 'تعذّر تحديث كلمة المرور. افتح رابط استرجاع جديد.');
        setRecovery(false);
        setRecoveryVerified(false);
        clearRecoveryLocation();
      },
    }),
    [session, demo, loading, recovery, recoveryVerified],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
