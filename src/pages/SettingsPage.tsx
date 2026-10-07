import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  UserRound,
  Cloud,
  KeyRound,
  Moon,
  Sun,
  Trash2,
  RefreshCw,
  HardDrive,
  ExternalLink,
  CircleHelp,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { PageHeader, Card, ConfirmDialog } from '../components/ui';
import { todayKey } from '../lib/dates';
import { useAuth } from '../state/AuthContext';
import { STORAGE_KEY } from '../lib/storage';
import { TEXT_SIZE_OPTIONS } from '../lib/appearance';

export default function SettingsPage() {
  const {
    data,
    updateProfile,
    importBackup,
    clearData,
    resetDemo,
    notify,
    syncStatus,
    syncError,
    lastSyncedAt,
    retrySync,
    resolveSyncConflict,
  } = useApp();
  const { mode, user, changePassword } = useAuth();
  const isCloud = mode === 'cloud';
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [accountError, setAccountError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const syncLabels = {
    local: 'محفوظ على هذا المتصفح',
    loading: 'تحميل بيانات الحساب',
    saving: 'التغييرات تنتظر الحفظ السحابي',
    synced: 'محفوظ في السحابة',
    offline: 'اتصالك غير متوفر — تغييراتك تنتظر المزامنة',
    error: 'تعذّر إتمام المزامنة',
    conflict: 'هناك نسخة أحدث على جهاز آخر',
  };
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setAccountError('');
    if (password.length < 10 || password.length > 128) {
      setAccountError('اختر كلمة مرور بين 10 و128 حرفاً.');
      return;
    }
    if (password !== passwordConfirmation) {
      setAccountError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(password);
      setPassword('');
      setPasswordConfirmation('');
      notify('تم تغيير كلمة المرور');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'تعذّر تغيير كلمة المرور.');
    } finally {
      setPasswordBusy(false);
    }
  };
  const importBrowserData = () => {
    setError('');
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setError(
          'ماكو بيانات للنسخة القديمة على هذا المتصفح والعنوان. استرجع ملف النسخة الاحتياطية إذا كنت تستخدم عنواناً آخر.',
        );
        return;
      }
      setPendingImport(saved);
      setConfirmation('import');
    } catch {
      setError('تعذّرت قراءة بيانات النسخة القديمة. استخدم ملف النسخة الاحتياطية.');
    }
  };
  const handleConflict = async (strategy: 'reload' | 'overwrite') => {
    try {
      await resolveSyncConflict(strategy);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذّرت معالجة التعارض.');
    }
  };
  const [name, setName] = useState(data.profile.name);
  const [role, setRole] = useState(data.profile.role);
  const [weekly, setWeekly] = useState(data.profile.weeklyGoalMinutes / 60);
  const [focus, setFocus] = useState(data.profile.focusMinutes);
  const [confirmation, setConfirmation] = useState<
    'clear' | 'demo' | 'import' | 'reload' | 'overwrite' | null
  >(null);
  const [pendingImport, setPendingImport] = useState('');
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  useEffect(() => {
    setName(data.profile.name);
    setRole(data.profile.role);
    setWeekly(data.profile.weeklyGoalMinutes / 60);
    setFocus(data.profile.focusMinutes);
  }, [
    data.profile.name,
    data.profile.role,
    data.profile.weeklyGoalMinutes,
    data.profile.focusMinutes,
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setProfileError('اكتب اسمك قبل حفظ الإعدادات.');
      return;
    }
    if (
      !Number.isFinite(weekly) ||
      weekly < 0.5 ||
      weekly > 168 ||
      !Number.isInteger(focus) ||
      focus < 1 ||
      focus > 180
    ) {
      setProfileError('تحقق من هدف الأسبوع ومدة التركيز.');
      return;
    }
    setProfileError('');
    updateProfile({
      name: name.trim(),
      role: role.trim(),
      weeklyGoalMinutes: Math.round(weekly * 60),
      focusMinutes: focus,
    });
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `madar-backup-${todayKey()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('تم تنزيل نسخة احتياطية من بياناتك');
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError('الملف أكبر من الحجم المسموح: 5 ميغابايت.');
      return;
    }
    try {
      setPendingImport(await file.text());
      setConfirmation('import');
    } catch {
      setError('تعذّرت قراءة الملف. جرّب نسخة احتياطية أخرى.');
    }
    if (inputRef.current) inputRef.current.value = '';
  };
  const doImport = () => {
    try {
      importBackup(pendingImport);
      setPendingImport('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ملف النسخة الاحتياطية غير صالح.');
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="مساحة تشبهك"
        title="الإعدادات"
        description="رتّب أهدافك، خصّص تجربتك، واحتفظ بنسخة آمنة من رحلتك."
      />
      <div className="settings-layout">
        <div className="settings-main">
          <Card title="حجم الخط">
            <p className="settings-description">
              كبّر النص بما يناسبك. يتغيّر الحجم مباشرة ويبقى محفوظاً
              {isCloud ? ' في حسابك على أجهزتك.' : ' على هذا المتصفح.'}
            </p>
            <fieldset className="text-size-options">
              <legend className="sr-only">اختر حجم الخط</legend>
              {TEXT_SIZE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`text-size-option ${(data.profile.textSize ?? 'normal') === option.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="textSize"
                    value={option.value}
                    checked={(data.profile.textSize ?? 'normal') === option.value}
                    onChange={() => updateProfile({ textSize: option.value })}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.percentage}%</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-size-preview">خطوة صغيرة اليوم، تقدّم واضح بكرة.</p>
          </Card>
          {isCloud && (
            <Card title="حسابك والحفظ السحابي">
              <div className="account-summary">
                <UserRound size={24} />
                <div>
                  <strong dir="ltr">{String(user?.user_metadata.username || '')}</strong>
                  <p dir="ltr">{user?.email}</p>
                </div>
              </div>
              <div className={`sync-summary sync-${syncStatus}`} role="status">
                <Cloud size={20} />
                <div>
                  <strong>{syncLabels[syncStatus]}</strong>
                  {lastSyncedAt && (
                    <p>
                      آخر حفظ:{' '}
                      {new Intl.DateTimeFormat('ar-IQ', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Asia/Baghdad',
                      }).format(new Date(lastSyncedAt))}
                    </p>
                  )}
                </div>
              </div>
              {syncError && <p className="form-error">{syncError}</p>}
              <p className="settings-description">
                كل حساب عنده مساحة خاصة. التعديلات تُحفظ تلقائياً عند توفر الاتصال، وتظهر حالة الحفظ
                هنا. ملفات النسخ الاحتياطية تشمل بيانات مساحتك؛ احفظها بمكان خاص.
              </p>
              {['offline', 'error'].includes(syncStatus) && (
                <button className="button secondary" onClick={retrySync}>
                  <RefreshCw size={16} />
                  إعادة المزامنة
                </button>
              )}
              {syncStatus === 'conflict' && (
                <div className="conflict-actions">
                  <p>
                    نزّل نسخة احتياطية أولاً، ثم اختَر البيانات التي تريد اعتمادها. لن نكتب فوق
                    النسخة الأحدث تلقائياً.
                  </p>
                  <button className="button secondary" onClick={() => setConfirmation('reload')}>
                    تحميل نسخة السحابة
                  </button>
                  <button
                    className="button danger-outline"
                    onClick={() => setConfirmation('overwrite')}
                  >
                    اعتماد النسخة الحالية
                  </button>
                </div>
              )}
              <form className="password-settings" onSubmit={(e) => void savePassword(e)}>
                <h3>
                  <KeyRound size={18} />
                  تغيير كلمة المرور
                </h3>
                <div className="form-grid">
                  <label className="form-field">
                    كلمة المرور الجديدة
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    تأكيد كلمة المرور الجديدة
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                      required
                      value={passwordConfirmation}
                      onChange={(e) => setPasswordConfirmation(e.target.value)}
                    />
                  </label>
                </div>
                {accountError && (
                  <p className="form-error" role="alert">
                    {accountError}
                  </p>
                )}
                <button className="button secondary" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
                </button>
              </form>
            </Card>
          )}

          <Card title="ملفك الشخصي">
            <form onSubmit={save}>
              <div className="profile-preview">
                <span className="avatar avatar-large">{name.charAt(0) || 'م'}</span>
                <div>
                  <h3>{name || 'مساحتك الشخصية'}</h3>
                  <p>{role}</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  اسمك
                  <input
                    required
                    maxLength={50}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  وصف رحلتك
                  <input maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} />
                </label>
                <label className="form-field">
                  هدف الأسبوع (ساعات)
                  <input
                    type="number"
                    min="0.5"
                    max="168"
                    step="0.5"
                    required
                    value={weekly}
                    onChange={(e) => setWeekly(Number(e.target.value))}
                  />
                </label>
                <label className="form-field">
                  مدة جلسة التركيز (دقائق)
                  <input
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    required
                    value={focus}
                    onChange={(e) => setFocus(Number(e.target.value))}
                  />
                </label>
              </div>
              {profileError && (
                <p className="form-error" role="alert">
                  {profileError}
                </p>
              )}
              <div className="form-actions">
                <button className="button primary" type="submit">
                  حفظ التغييرات
                </button>
                <span className="helper-text">المدة الجديدة تُطبّق عند فتح جلسة جديدة.</span>
              </div>
            </form>
          </Card>
          <Card title="مظهر مساحتك">
            <p className="settings-description">اختر الإضاءة التي تناسب وقتك.</p>
            <div className="theme-options">
              <button
                className={`theme-option ${data.profile.theme === 'light' ? 'selected' : ''}`}
                onClick={() => updateProfile({ theme: 'light' })}
                aria-pressed={data.profile.theme === 'light'}
              >
                <Sun size={22} />
                <span>وضع نهاري</span>
                <div className="theme-preview light-preview">
                  <i />
                  <i />
                  <i />
                </div>
              </button>
              <button
                className={`theme-option ${data.profile.theme === 'dark' ? 'selected' : ''}`}
                onClick={() => updateProfile({ theme: 'dark' })}
                aria-pressed={data.profile.theme === 'dark'}
              >
                <Moon size={22} />
                <span>وضع ليلي</span>
                <div className="theme-preview dark-preview">
                  <i />
                  <i />
                  <i />
                </div>
              </button>
            </div>
          </Card>
          <Card title="نسختك الاحتياطية">
            <div className="backup-description">
              <HardDrive size={25} />
              <div>
                <h3>بياناتك تستحق أن تحتفظ بها</h3>
                <p>
                  {isCloud
                    ? 'الحفظ السحابي يتيح فتح مساحتك من أجهزتك. نزّل نسخة إضافية قبل الاسترجاع أو معالجة تعارض، لأن الاسترجاع يستبدل بيانات الحساب الحالي.'
                    : 'هذه تجربة محلية محفوظة في هذا المتصفح. نزّل نسخة لاسترجاعها في حسابك السحابي لاحقاً.'}
                </p>
              </div>
            </div>
            <div className="backup-actions">
              <button className="button primary" onClick={exportBackup}>
                <Download size={16} />
                تنزيل نسخة احتياطية
              </button>
              <button className="button secondary" onClick={() => inputRef.current?.click()}>
                <Upload size={16} />
                استرجاع نسخة
              </button>
              {isCloud && (
                <button className="button secondary" onClick={importBrowserData}>
                  <Upload size={16} />
                  نقل بيانات النسخة القديمة
                </button>
              )}
              <input
                hidden
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => void loadFile(e.target.files?.[0])}
              />
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="data-counts">
              <span>{data.tasks.length} مهام</span>
              <span>{data.skills.length} مهارات</span>
              <span>{data.entries.length} أنشطة</span>
              <span>{data.events.length} مواعيد</span>
            </div>
          </Card>
          <Card className="danger-zone" title="إدارة بيانات المساحة">
            <div className="settings-action-row">
              <div>
                <h3>بداية جديدة</h3>
                <p>مسح المهام والمهارات والسجلات والمواعيد. تبقى إعداداتك كما هي.</p>
              </div>
              <button className="button danger-outline" onClick={() => setConfirmation('clear')}>
                <Trash2 size={15} />
                مسح البيانات
              </button>
            </div>
            <div className="settings-action-row">
              <div>
                <h3>استعادة المثال التجريبي</h3>
                <p>استبدال بياناتك بمثال يساعدك على استكشاف مدار.</p>
              </div>
              <button className="button secondary" onClick={() => setConfirmation('demo')}>
                <RefreshCw size={15} />
                استعادة المثال
              </button>
            </div>
          </Card>
        </div>
        <aside className="settings-aside">
          <div className="privacy-card">
            <ShieldCheck size={31} />
            <h2>مساحتك، وبياناتك.</h2>
            <p>
              {isCloud
                ? 'بيانات المساحة محفوظة في قاعدة بيانات Supabase تحت حسابك، وسياسات الوصول تسمح للحساب بقراءة بياناته فقط.'
                : 'أنت في التجربة المحلية. بياناتها تبقى في هذا المتصفح، ويمكنك استكشاف مدار قبل إنشاء حساب.'}
            </p>
            <div>
              <UserRound size={15} />
              {isCloud ? 'حساب بكلمة مرور وجلسة تسجيل دخول' : 'تجربة بدون حساب'}
            </div>
            <div>
              <Cloud size={15} />
              {isCloud ? 'مزامنة عند توفر الاتصال' : 'التجربة المحلية لا تتزامن'}
            </div>
            <span>
              {isCloud
                ? 'التغييرات المعلّقة لها نسخة مؤقتة خاصة بالحساب على الجهاز. استخدم جهازاً موثوقاً، وصدّر نسخة قبل مسح بيانات المتصفح.'
                : 'مسح بيانات المتصفح يزيل سجلات التجربة. احتفظ بنسخة احتياطية.'}
            </span>
          </div>
          <Card title="وين تستضيف مدار؟">
            <p className="settings-description">
              Cloudflare Pages للواجهة مع HTTPS ونشر من GitHub، وSupabase للحسابات والبيانات. كلاهما
              يوفّر خطة مجانية ضمن حدود الاستخدام.
            </p>
            <a
              className="text-link"
              href="https://pages.cloudflare.com/"
              target="_blank"
              rel="noreferrer"
            >
              زيارة Cloudflare Pages
              <ExternalLink size={14} />
            </a>
            <div className="hosting-note">
              أمر البناء: <code dir="ltr">npm run build</code>
              <br />
              مجلد النشر: <code>dist</code>
            </div>
          </Card>
          <Card title="فكرة للبداية">
            <CircleHelp size={22} />
            <p className="settings-description">
              ابدأ بمهارتين أو ثلاث، وحدد هدفاً أسبوعياً واقعياً، ثم سجّل نشاطك بعد كل جلسة. ما
              تحتاج توثّق كل دقيقة حتى تشوف تقدّمك.
            </p>
          </Card>
        </aside>
      </div>
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation === 'overwrite'
              ? 'اعتماد النسخة الحالية؟'
              : confirmation === 'reload'
                ? 'تحميل نسخة السحابة؟'
                : confirmation === 'import'
                  ? 'استرجاع النسخة الاحتياطية؟'
                  : confirmation === 'clear'
                    ? 'بدء مساحة جديدة؟'
                    : 'استعادة البيانات التجريبية؟'
          }
          description={
            confirmation === 'overwrite'
              ? 'سيتم استبدال نسخة السحابة ببيانات هذا الجهاز. نزّل نسخة احتياطية أولاً. إذا حدث تعديل جديد أثناء العملية سيظهر التعارض مجدداً.'
              : confirmation === 'reload'
                ? 'سيتم تجاهل التعديلات المعلّقة على هذا الجهاز وتحميل بيانات السحابة. نزّل نسخة احتياطية قبل المتابعة.'
                : confirmation === 'import'
                  ? 'سيتم استبدال بيانات المساحة بمحتويات الملف. ننصح بتنزيل نسخة من بياناتك الحالية أولاً.'
                  : 'سيتم استبدال بياناتك الحالية. نزّل نسخة احتياطية قبل المتابعة، لأن هذه الخطوة لا يمكن التراجع عنها بدون نسخة.'
          }
          onClose={() => setConfirmation(null)}
          onConfirm={
            confirmation === 'overwrite'
              ? () => void handleConflict('overwrite')
              : confirmation === 'reload'
                ? () => void handleConflict('reload')
                : confirmation === 'import'
                  ? doImport
                  : confirmation === 'demo'
                    ? resetDemo
                    : clearData
          }
        />
      )}
    </>
  );
}
