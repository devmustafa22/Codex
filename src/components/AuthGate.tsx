import { useLanguage } from '../state/LanguageContext';
import { localizeMessage } from '../lib/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowUpLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  Cloud,
  Eye,
  EyeOff,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { configurationIssue } from '../lib/supabase';
import { Brand } from './Brand';
import { AccountAccessGate } from './AccountAccessGate';

type FormMode = 'signin' | 'signup' | 'forgot' | 'reset';

function callbackFailed() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return query.has('error') || hash.has('error') || query.has('error_description');
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { language, t } = useLanguage();
  const [formMode, setFormMode] = useState<FormMode>('signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => (callbackFailed() ? t('auth.callbackExpired') : ''));
  const mode = auth.recovery && auth.session && auth.recoveryVerified ? 'reset' : formMode;

  useEffect(() => {
    if (auth.mode === 'cloud' || auth.mode === 'demo') {
      setPassword('');
      setConfirmation('');
      setVisiblePassword(false);
    }
  }, [auth.mode, auth.recovery]);

  useEffect(() => {
    if (auth.mode === 'signed-out' || auth.recovery) {
      document.documentElement.dataset.theme = 'light';
      document.title = t('auth.documentTitle');
    }
  }, [auth.mode, auth.recovery, language, t]);

  const switchForm = (next: FormMode) => {
    setFormMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setVisiblePassword(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        await auth.signIn(identifier, password);
      } else if (mode === 'signup') {
        if (password !== confirmation) throw new Error(t('auth.passwordMismatch'));
        const result = await auth.signUp({ name, username, email, password });
        if (result.confirmationRequired) {
          setFormMode('signin');
          setIdentifier(email.trim());
          setPassword('');
          setConfirmation('');
          setNotice(t('auth.signupConfirmation'));
        }
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(email);
        setNotice(t('auth.recoveryEmailSent'));
      } else {
        if (password !== confirmation) throw new Error(t('auth.passwordMismatch'));
        await auth.changePassword(password);
        setPassword('');
        setConfirmation('');
        setFormMode('signin');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('auth.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (
    !auth.loading &&
    auth.mode === 'cloud' &&
    (auth.accessLoading ||
      auth.accessError ||
      !auth.accountAccess ||
      auth.accountAccess.status !== 'active')
  ) {
    return <AccountAccessGate />;
  }

  if (!auth.loading && !auth.recovery && (auth.mode === 'cloud' || auth.mode === 'demo')) {
    return <>{children}</>;
  }

  const title = {
    signin: t('auth.signinTitle'),
    signup: t('auth.signupTitle'),
    forgot: t('auth.forgotTitle'),
    reset: t('auth.resetTitle'),
  }[mode];
  const description = {
    signin: t('auth.signinDescription'),
    signup: t('auth.signupDescription'),
    forgot: t('auth.forgotDescription'),
    reset: t('auth.resetDescription'),
  }[mode];
  const buttonText = {
    signin: t('auth.signinButton'),
    signup: t('auth.signupButton'),
    forgot: t('auth.forgotButton'),
    reset: t('auth.resetButton'),
  }[mode];

  return (
    <main className="auth-shell" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-brand-row">
          <Brand />
          <LanguageSwitcher />
          <span className="auth-cloud-label">
            <Cloud size={15} /> {t('auth.cloudSpace')}
          </span>
        </div>
        {auth.loading ? (
          <div className="auth-loading" role="status">
            <LoaderCircle size={30} className="auth-spinner" />
            <h1>{t('auth.loadingTitle')}</h1>
            <p>{t('auth.loadingDescription')}</p>
          </div>
        ) : (
          <div className="auth-form-wrap">
            <span className="auth-eyebrow">
              <span /> {t('auth.eyebrow')}
            </span>
            <h1 id="auth-heading">{auth.configured ? title : t('auth.setupTitle')}</h1>
            <p className="auth-description">
              {auth.configured ? description : t('auth.setupDescription')}
            </p>

            {!auth.configured ? (
              <div className="auth-setup">
                <span className="auth-setup-icon">
                  <Cloud size={24} />
                </span>
                <h2>{t('auth.enableCloud')}</h2>
                <p>{localizeMessage(configurationIssue)}</p>
                <ol>
                  <li>{t('auth.setupCreateProject')}</li>
                  <li>
                    {t('auth.setupCopy')} <code dir="ltr">.env.example</code> {t('auth.setupTo')}{' '}
                    <code dir="ltr">.env.local</code> {t('auth.setupAddKey')}
                  </li>
                  <li>
                    {t('auth.setupRestart')} <code dir="ltr">docs/deployment.md</code>.
                  </li>
                </ol>
              </div>
            ) : (
              <>
                {(mode === 'signin' || mode === 'signup') && (
                  <div className="auth-tabs" aria-label={t('auth.formType')}>
                    <button
                      type="button"
                      aria-pressed={mode === 'signin'}
                      className={mode === 'signin' ? 'active' : ''}
                      disabled={busy}
                      onClick={() => switchForm('signin')}
                    >
                      {t('auth.signinTab')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === 'signup'}
                      className={mode === 'signup' ? 'active' : ''}
                      disabled={busy}
                      onClick={() => switchForm('signup')}
                    >
                      {t('auth.signupTab')}
                    </button>
                  </div>
                )}
                <form
                  className="auth-form"
                  onSubmit={submit}
                  aria-describedby={error ? 'auth-error' : undefined}
                >
                  {auth.recovery && !auth.recoveryVerified && (
                    <p className="auth-feedback auth-error" role="alert">
                      {t('auth.recoverySessionFailed')}
                    </p>
                  )}
                  {mode === 'signup' && (
                    <>
                      <label className="auth-field" htmlFor="auth-name">
                        <span>{t('auth.name')}</span>
                        <input
                          id="auth-name"
                          name="name"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={80}
                          required
                          placeholder={t('auth.namePlaceholder')}
                          disabled={busy}
                        />
                      </label>
                      <label className="auth-field" htmlFor="auth-username">
                        <span>{t('auth.username')}</span>
                        <input
                          id="auth-username"
                          name="username"
                          dir="ltr"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          value={username}
                          onChange={(e) => setUsername(e.target.value.toLowerCase())}
                          minLength={3}
                          maxLength={24}
                          pattern="[a-z0-9_]{3,24}"
                          required
                          placeholder={t('auth.usernamePlaceholder')}
                          disabled={busy}
                          aria-describedby="auth-username-help"
                        />
                        <small id="auth-username-help">{t('auth.usernameHelp')}</small>
                      </label>
                    </>
                  )}
                  {mode === 'signin' && (
                    <label className="auth-field" htmlFor="auth-identifier">
                      <span>{t('auth.identifier')}</span>
                      <input
                        id="auth-identifier"
                        name="username"
                        dir="ltr"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        required
                        placeholder={t('auth.identifierPlaceholder')}
                        disabled={busy}
                      />
                    </label>
                  )}
                  {(mode === 'signup' || mode === 'forgot') && (
                    <label className="auth-field" htmlFor="auth-email">
                      <span>{t('auth.email')}</span>
                      <input
                        id="auth-email"
                        name="email"
                        type="email"
                        dir="ltr"
                        autoComplete="email"
                        maxLength={254}
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={t('auth.emailPlaceholder')}
                        disabled={busy}
                      />
                      {mode === 'signup' && <small>{t('auth.emailHelp')}</small>}
                    </label>
                  )}
                  {mode !== 'forgot' && (
                    <label className="auth-field" htmlFor="auth-password">
                      <span>{mode === 'reset' ? t('auth.newPassword') : t('auth.password')}</span>
                      <span className="auth-password-wrap">
                        <input
                          id="auth-password"
                          name="password"
                          type={visiblePassword ? 'text' : 'password'}
                          dir="ltr"
                          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={mode === 'signin' ? undefined : 10}
                          maxLength={128}
                          disabled={busy}
                          aria-describedby={mode !== 'signin' ? 'auth-password-help' : undefined}
                        />
                        <button
                          type="button"
                          onClick={() => setVisiblePassword((value) => !value)}
                          disabled={busy}
                          aria-label={
                            visiblePassword ? t('auth.hidePassword') : t('auth.showPassword')
                          }
                        >
                          {visiblePassword ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                      </span>
                      {mode !== 'signin' && (
                        <small id="auth-password-help">{t('auth.passwordHelp')}</small>
                      )}
                    </label>
                  )}
                  {(mode === 'signup' || mode === 'reset') && (
                    <label className="auth-field" htmlFor="auth-confirmation">
                      <span>{t('auth.confirmPassword')}</span>
                      <input
                        id="auth-confirmation"
                        name="password-confirmation"
                        type={visiblePassword ? 'text' : 'password'}
                        dir="ltr"
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        required
                        minLength={10}
                        maxLength={128}
                        disabled={busy}
                      />
                    </label>
                  )}
                  {mode === 'signin' && (
                    <button
                      type="button"
                      className="auth-forgot"
                      onClick={() => switchForm('forgot')}
                      disabled={busy}
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  )}
                  {error && (
                    <p className="auth-feedback auth-error" id="auth-error" role="alert">
                      {localizeMessage(error)}
                    </p>
                  )}
                  {notice && (
                    <p className="auth-feedback auth-notice" role="status">
                      <Check size={17} />
                      {localizeMessage(notice)}
                    </p>
                  )}
                  <button type="submit" className="auth-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <LoaderCircle size={19} className="auth-spinner" /> {t('auth.pleaseWait')}
                      </>
                    ) : (
                      <>
                        {buttonText}
                        <ArrowUpLeft
                          size={18}
                          style={language === 'en' ? { transform: 'scaleX(-1)' } : undefined}
                        />
                      </>
                    )}
                  </button>
                </form>
                {(mode === 'forgot' || mode === 'reset') && (
                  <button
                    type="button"
                    className="auth-back"
                    disabled={busy}
                    onClick={() => {
                      if (mode === 'reset') {
                        void auth.signOut().catch(() => setError(t('auth.endSessionFailed')));
                      } else switchForm('signin');
                    }}
                  >
                    <ChevronLeft
                      size={17}
                      style={language === 'ar' ? { transform: 'scaleX(-1)' } : undefined}
                    />{' '}
                    {t('auth.backToSignin')}
                  </button>
                )}
              </>
            )}

            {!auth.recovery && (
              <div className="auth-demo">
                <button type="button" onClick={auth.enterDemo} disabled={busy}>
                  {t('auth.tryDemo')} <ArrowUpLeft size={16} />
                </button>
                <p>{t('auth.demoPrivacy')}</p>
              </div>
            )}
            <div className="auth-trust">
              <LockKeyhole size={14} />
              <span>{t('auth.trust')}</span>
            </div>
          </div>
        )}
        <p className="auth-footer">
          {t('auth.footer')} <span dir="ltr">{t('auth.version')}</span>
        </p>
      </section>

      <aside className="auth-story" aria-label={t('auth.featuresLabel')}>
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <span className="auth-story-tag">
          <Leaf size={15} /> {t('auth.storyTag')}
        </span>
        <div className="auth-story-heading">
          <h2>
            {t('auth.storyHeadingStart')}
            <br />
            <span>{t('auth.storyHeadingEnd')}</span>
          </h2>
          <p>{t('auth.storyDescription')}</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview-title">
            <span>
              <Sprout size={19} /> {t('auth.growthJourney')}
            </span>
            <span>{t('auth.thisWeek')}</span>
          </div>
          <div className="auth-preview-stats">
            <div>
              <span>{t('auth.learningTime')}</span>
              <strong>
                8.5 <small>{t('auth.hours')}</small>
              </strong>
            </div>
            <span className="auth-preview-growth">{t('auth.stepForward')}</span>
          </div>
          <div className="auth-preview-chart">
            {[36, 59, 48, 82, 65, 92, 73].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="auth-preview-bottom">
            <span>
              <Check size={14} /> {t('auth.planned')}
            </span>
            <span>
              <Check size={14} /> {t('auth.learned')}
            </span>
            <span>
              <Check size={14} /> {t('auth.progressed')}
            </span>
          </div>
        </div>
        <div className="auth-story-features">
          <span>
            <CalendarDays size={19} />
            <strong>{t('auth.featureDayTitle')}</strong>
            <small>{t('auth.featureDayDescription')}</small>
          </span>
          <span>
            <Cloud size={19} />
            <strong>{t('auth.featureSyncTitle')}</strong>
            <small>{t('auth.featureSyncDescription')}</small>
          </span>
          <span>
            <ShieldCheck size={19} />
            <strong>{t('auth.featurePrivateTitle')}</strong>
            <small>{t('auth.featurePrivateDescription')}</small>
          </span>
        </div>
        <div className="auth-story-signature">
          <span /> {t('auth.storySignature')}
        </div>
      </aside>
    </main>
  );
}
