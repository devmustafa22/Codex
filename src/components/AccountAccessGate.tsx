import { useLanguage } from '../state/LanguageContext';
import { localizeMessage } from '../lib/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useState } from 'react';
import { LoaderCircle, LockKeyhole, ShieldAlert } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { Brand } from './Brand';

export function AccountAccessGate() {
  const auth = useAuth();
  const { language, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const status = auth.accountAccess?.status;
  const title = auth.accessLoading
    ? t('auth.checkingAccount')
    : status === 'suspended'
      ? t('auth.suspendedTitle')
      : status === 'deleted'
        ? t('auth.deletedTitle')
        : t('auth.accessUnavailable');
  const description = auth.accessLoading
    ? t('auth.checkingAccessDescription')
    : status === 'suspended'
      ? t('auth.suspendedDescription')
      : status === 'deleted'
        ? t('auth.deletedDescription')
        : localizeMessage(auth.accessError) || t('auth.checkConnection');

  async function leave() {
    setBusy(true);
    setSignOutError('');
    try {
      await auth.signOut();
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : t('auth.signOutRetry'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-access-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <section className="account-access-card" aria-labelledby="account-access-heading">
        <Brand />
        <LanguageSwitcher />
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
                {t('auth.recheckAccess')}
              </button>
            )}
            <button className="button secondary" onClick={() => void leave()} disabled={busy}>
              {busy ? t('auth.signingOut') : t('auth.signOut')}
            </button>
          </div>
        )}
        {signOutError && (
          <p className="auth-feedback auth-error" role="alert">
            {localizeMessage(signOutError)}
          </p>
        )}
      </section>
    </main>
  );
}
