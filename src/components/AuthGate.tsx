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
  const [notice, setNotice] = useState(() =>
    callbackFailed() ? 'رابط الدخول منتهي أو غير صالح. اطلب رسالة جديدة وافتحها بنفس المتصفح.' : '',
  );
  const mode = auth.recovery && auth.session && auth.recoveryVerified ? 'reset' : formMode;

  useEffect(() => {
    if (auth.mode === 'cloud' || auth.mode === 'demo') {
      setPassword('');
      setConfirmation('');
      setVisiblePassword(false);
    }
    if (auth.mode === 'signed-out' || auth.recovery) {
      document.documentElement.dataset.theme = 'light';
      document.title = 'أهلاً في مدار — مساحتك للنمو';
    }
  }, [auth.mode, auth.recovery]);

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
        if (password !== confirmation) throw new Error('تأكيد كلمة المرور غير مطابق.');
        const result = await auth.signUp({ name, username, email, password });
        if (result.confirmationRequired) {
          setFormMode('signin');
          setIdentifier(email.trim());
          setPassword('');
          setConfirmation('');
          setNotice(
            'خطوتك الأولى تمت! فعّل بريدك من رسالة التأكيد، وافتح الرابط بنفس المتصفح، ثم سجّل الدخول.',
          );
        }
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(email);
        setNotice(
          'إذا كان البريد مسجّلاً، ستوصلك رسالة استرجاع. افتح رابطها بنفس المتصفح خلال مدة صلاحيته.',
        );
      } else {
        if (password !== confirmation) throw new Error('تأكيد كلمة المرور غير مطابق.');
        await auth.changePassword(password);
        setPassword('');
        setConfirmation('');
        setFormMode('signin');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّرت العملية. حاول مجدداً.');
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
    signin: 'أهلاً بعودتك.',
    signup: 'كل رحلة تبدأ بخطوة.',
    forgot: 'نرجّعك إلى مدارك.',
    reset: 'بداية جديدة وآمنة.',
  }[mode];
  const description = {
    signin: 'مهامك، مهاراتك، وخطواتك الصغيرة… كلها بمكان واحد.',
    signup: 'أنشئ حسابك، وخلي تقدّمك وياك على كل أجهزتك.',
    forgot: 'اكتب بريد حسابك حتى نرسل لك رابط تغيير كلمة المرور.',
    reset: 'اختَر كلمة مرور جديدة لحسابك حتى تكمل رحلتك.',
  }[mode];
  const buttonText = {
    signin: 'ادخل إلى مساحتك',
    signup: 'أنشئ حسابي',
    forgot: 'أرسل رابط الاسترجاع',
    reset: 'احفظ كلمة المرور',
  }[mode];

  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-brand-row">
          <Brand />
          <span className="auth-cloud-label">
            <Cloud size={15} /> مساحتك السحابية
          </span>
        </div>
        {auth.loading ? (
          <div className="auth-loading" role="status">
            <LoaderCircle size={30} className="auth-spinner" />
            <h1>نجهّز مساحتك…</h1>
            <p>لحظة ونكمل رحلتك.</p>
          </div>
        ) : (
          <div className="auth-form-wrap">
            <span className="auth-eyebrow">
              <span /> على وتيرتك، كل يوم
            </span>
            <h1 id="auth-heading">{auth.configured ? title : 'مساحتك جاهزة للنمو.'}</h1>
            <p className="auth-description">
              {auth.configured
                ? description
                : 'اربط الحسابات السحابية، أو اكتشف مدار بنسخة تجريبية على هذا المتصفح.'}
            </p>

            {!auth.configured ? (
              <div className="auth-setup">
                <span className="auth-setup-icon">
                  <Cloud size={24} />
                </span>
                <h2>فعّل الحفظ السحابي</h2>
                <p>{configurationIssue}</p>
                <ol>
                  <li>أنشئ مشروع Supabase مجاني وطبّق ملف إعداد قاعدة البيانات.</li>
                  <li>
                    انسخ <code dir="ltr">.env.example</code> إلى <code dir="ltr">.env.local</code>،
                    وأضف الرابط والمفتاح العام.
                  </li>
                  <li>
                    أعد تشغيل المشروع. شرح الإعداد الكامل بملف{' '}
                    <code dir="ltr">docs/deployment.md</code>.
                  </li>
                </ol>
              </div>
            ) : (
              <>
                {(mode === 'signin' || mode === 'signup') && (
                  <div className="auth-tabs" aria-label="نوع الدخول">
                    <button
                      type="button"
                      aria-pressed={mode === 'signin'}
                      className={mode === 'signin' ? 'active' : ''}
                      disabled={busy}
                      onClick={() => switchForm('signin')}
                    >
                      تسجيل الدخول
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === 'signup'}
                      className={mode === 'signup' ? 'active' : ''}
                      disabled={busy}
                      onClick={() => switchForm('signup')}
                    >
                      حساب جديد
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
                      تعذّر فتح جلسة الاسترجاع. اطلب رابطاً جديداً من «نسيت كلمة المرور»، وافتحه
                      بنفس المتصفح.
                    </p>
                  )}
                  {mode === 'signup' && (
                    <>
                      <label className="auth-field" htmlFor="auth-name">
                        <span>اسمك</span>
                        <input
                          id="auth-name"
                          name="name"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={80}
                          required
                          placeholder="شنو نحب نناديك؟"
                          disabled={busy}
                        />
                      </label>
                      <label className="auth-field" htmlFor="auth-username">
                        <span>اسم المستخدم</span>
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
                          placeholder="your_name"
                          disabled={busy}
                          aria-describedby="auth-username-help"
                        />
                        <small id="auth-username-help">
                          3–24 حرفاً إنكليزياً أو رقماً أو _، بدون مسافات.
                        </small>
                      </label>
                    </>
                  )}
                  {mode === 'signin' && (
                    <label className="auth-field" htmlFor="auth-identifier">
                      <span>اسم المستخدم أو البريد الإلكتروني</span>
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
                        placeholder="your_name / you@example.com"
                        disabled={busy}
                      />
                    </label>
                  )}
                  {(mode === 'signup' || mode === 'forgot') && (
                    <label className="auth-field" htmlFor="auth-email">
                      <span>البريد الإلكتروني</span>
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
                        placeholder="you@example.com"
                        disabled={busy}
                      />
                      {mode === 'signup' && (
                        <small>نستخدمه لتأكيد الحساب واسترجاع كلمة المرور.</small>
                      )}
                    </label>
                  )}
                  {mode !== 'forgot' && (
                    <label className="auth-field" htmlFor="auth-password">
                      <span>{mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</span>
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
                          aria-label={visiblePassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {visiblePassword ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                      </span>
                      {mode !== 'signin' && (
                        <small id="auth-password-help">
                          من 10 إلى 128 حرفاً، تتضمن حرفاً ورقماً.
                        </small>
                      )}
                    </label>
                  )}
                  {(mode === 'signup' || mode === 'reset') && (
                    <label className="auth-field" htmlFor="auth-confirmation">
                      <span>تأكيد كلمة المرور</span>
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
                      نسيت كلمة المرور؟
                    </button>
                  )}
                  {error && (
                    <p className="auth-feedback auth-error" id="auth-error" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="auth-feedback auth-notice" role="status">
                      <Check size={17} />
                      {notice}
                    </p>
                  )}
                  <button type="submit" className="auth-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <LoaderCircle size={19} className="auth-spinner" /> لحظة…
                      </>
                    ) : (
                      <>
                        {buttonText}
                        <ArrowUpLeft size={18} />
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
                        void auth
                          .signOut()
                          .catch(() => setError('تعذّر إنهاء الجلسة. حاول مجدداً.'));
                      } else switchForm('signin');
                    }}
                  >
                    <ChevronLeft size={17} /> العودة إلى تسجيل الدخول
                  </button>
                )}
              </>
            )}

            {!auth.recovery && (
              <div className="auth-demo">
                <button type="button" onClick={auth.enterDemo} disabled={busy}>
                  جرّب مدار بدون حساب <ArrowUpLeft size={16} />
                </button>
                <p>بيانات التجربة تبقى على هذا المتصفح. الحفظ السحابي يبدأ مع حسابك.</p>
              </div>
            )}
            <div className="auth-trust">
              <LockKeyhole size={14} />
              <span>مساحتك خاصة بك. حسابك يحفظ تقدّمك بين أجهزتك.</span>
            </div>
          </div>
        )}
        <p className="auth-footer">
          صُنع لرحلتك، على وتيرتك. <span dir="ltr">مدار 2.0</span>
        </p>
      </section>

      <aside className="auth-story" aria-label="مزايا مدار">
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <span className="auth-story-tag">
          <Leaf size={15} /> مساحة تنمو معك
        </span>
        <div className="auth-story-heading">
          <h2>
            كل خطوة صغيرة،
            <br />
            <span>تصنع فرقاً كبيراً.</span>
          </h2>
          <p>رتّب يومك، طوّر مهاراتك، وخلّي أثر تعبك واضحاً. مدار يجمع رحلتك بمكان هادئ وواضح.</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview-title">
            <span>
              <Sprout size={19} /> رحلة النمو
            </span>
            <span>هذا الأسبوع</span>
          </div>
          <div className="auth-preview-stats">
            <div>
              <span>وقت التعلّم</span>
              <strong>
                8.5 <small>ساعة</small>
              </strong>
            </div>
            <span className="auth-preview-growth">↗ خطوة للأمام</span>
          </div>
          <div className="auth-preview-chart">
            {[36, 59, 48, 82, 65, 92, 73].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="auth-preview-bottom">
            <span>
              <Check size={14} /> خطّطت
            </span>
            <span>
              <Check size={14} /> تعلّمت
            </span>
            <span>
              <Check size={14} /> تقدّمت
            </span>
          </div>
        </div>
        <div className="auth-story-features">
          <span>
            <CalendarDays size={19} />
            <strong>يومك تحت سيطرتك</strong>
            <small>مهام، تقويم، وسجلّ يومي.</small>
          </span>
          <span>
            <Cloud size={19} />
            <strong>تقدّمك وياك دائماً</strong>
            <small>على الكمبيوتر والهاتف.</small>
          </span>
          <span>
            <ShieldCheck size={19} />
            <strong>مساحة باسمك</strong>
            <small>حساب وبيانات خاصة بك.</small>
          </span>
        </div>
        <div className="auth-story-signature">
          <span /> تقدّم حقيقي، خطوة بخطوة.
        </div>
      </aside>
    </main>
  );
}
