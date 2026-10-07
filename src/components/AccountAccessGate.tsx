import { useState } from 'react';
import { LoaderCircle, LockKeyhole, ShieldAlert } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { Brand } from './Brand';

export function AccountAccessGate() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const status = auth.accountAccess?.status;
  const title = auth.accessLoading
    ? 'نتحقق من حسابك…'
    : status === 'suspended'
      ? 'حسابك موقوف'
      : status === 'deleted'
        ? 'حسابك محذوف'
        : 'تعذّر تأكيد حالة الحساب';
  const description = auth.accessLoading
    ? 'نحمّل حالة الحساب والصلاحيات من السحابة.'
    : status === 'suspended'
      ? 'أوقفت الإدارة حسابك. تواصل مع إدارة الموقع لإعادة تفعيله.'
      : status === 'deleted'
        ? 'حُذف هذا الحساب من الموقع. سجّل الخروج للعودة إلى صفحة الدخول.'
        : auth.accessError || 'تأكد من الاتصال بالإنترنت ثم أعد المحاولة.';

  async function leave() {
    setBusy(true);
    setSignOutError('');
    try {
      await auth.signOut();
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : 'تعذّر تسجيل الخروج. أعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-access-screen" dir="rtl">
      <section className="account-access-card" aria-labelledby="account-access-heading">
        <Brand />
        <span className="account-access-icon" aria-hidden="true">
          {auth.accessLoading ? (
            <LoaderCircle className="auth-spinner" size={30} />
          ) : status === 'suspended' ? (
            <LockKeyhole size={30} />
          ) : (
            <ShieldAlert size={30} />
          )}
        </span>
        <h1 id="account-access-heading">{title}</h1>
        <p role={auth.accessError ? 'alert' : 'status'}>{description}</p>
        {!auth.accessLoading && (
          <div className="account-access-actions">
            {status !== 'deleted' && (
              <button
                className="button primary"
                onClick={() => void auth.refreshAccountAccess()}
                disabled={busy}
              >
                إعادة التحقق
              </button>
            )}
            <button className="button secondary" onClick={() => void leave()} disabled={busy}>
              {busy ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
            </button>
          </div>
        )}
        {signOutError && (
          <p className="auth-feedback auth-error" role="alert">
            {signOutError}
          </p>
        )}
      </section>
    </main>
  );
}
