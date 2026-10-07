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
import { useLanguage } from '../state/LanguageContext';
import { getLocale, localizeMessage } from '../lib/i18n';

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
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
    local: t('settings.sync.local'),
    loading: t('settings.sync.loading'),
    saving: t('settings.sync.saving'),
    synced: t('settings.sync.synced'),
    offline: t('settings.sync.offline'),
    error: t('settings.sync.error'),
    conflict: t('settings.sync.conflict'),
  };
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setAccountError('');
    if (password.length < 10 || password.length > 128) {
      setAccountError(t('settings.password.lengthError'));
      return;
    }
    if (password !== passwordConfirmation) {
      setAccountError(t('settings.password.matchError'));
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(password);
      setPassword('');
      setPasswordConfirmation('');
      notify(t('settings.password.success'));
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : t('settings.password.failed'));
    } finally {
      setPasswordBusy(false);
    }
  };
  const importBrowserData = () => {
    setError('');
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setError(t('settings.backup.legacyMissing'));
        return;
      }
      setPendingImport(saved);
      setConfirmation('import');
    } catch {
      setError(t('settings.backup.legacyFailed'));
    }
  };
  const handleConflict = async (strategy: 'reload' | 'overwrite') => {
    try {
      await resolveSyncConflict(strategy);
    } catch (error) {
      notify(
        error instanceof Error ? localizeMessage(error.message) : t('settings.sync.resolveFailed'),
      );
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
      setProfileError(t('settings.profile.nameError'));
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
      setProfileError(t('settings.profile.goalError'));
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
    notify(t('settings.backup.downloaded'));
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError(t('settings.backup.tooLarge'));
      return;
    }
    try {
      setPendingImport(await file.text());
      setConfirmation('import');
    } catch {
      setError(t('settings.backup.readFailed'));
    }
    if (inputRef.current) inputRef.current.value = '';
  };
  const doImport = () => {
    try {
      importBackup(pendingImport);
      setPendingImport('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.backup.invalid'));
    }
  };
  return (
    <>
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        description={t('settings.description')}
      />
      <div className="settings-layout">
        <div className="settings-main">
          <Card title={t('settings.language.title')}>
            <p className="settings-description">{t('settings.language.description')}</p>
            <fieldset className="text-size-options">
              <legend className="sr-only">{t('settings.language.choose')}</legend>
              {(['en', 'ar'] as const).map((value) => (
                <label
                  key={value}
                  className={`text-size-option ${language === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="language"
                    value={value}
                    checked={language === value}
                    onChange={() => {
                      setLanguage(value);
                      updateProfile({ language: value });
                    }}
                  />
                  <span>
                    <strong lang={value} dir={value === 'ar' ? 'rtl' : 'ltr'}>
                      {value === 'en' ? 'English' : 'العربية'}
                    </strong>
                  </span>
                </label>
              ))}
            </fieldset>
          </Card>
          <Card title={t('settings.textSize.title')}>
            <p className="settings-description">
              {t(
                isCloud
                  ? 'settings.textSize.cloudDescription'
                  : 'settings.textSize.localDescription',
              )}
            </p>
            <fieldset className="text-size-options">
              <legend className="sr-only">{t('settings.textSize.choose')}</legend>
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
                    <strong>{t(option.label)}</strong>
                    <small>{option.percentage.toLocaleString(getLocale())}%</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-size-preview">{t('settings.textSize.preview')}</p>
          </Card>
          {isCloud && (
            <Card title={t('settings.cloud.title')}>
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
                      {t('settings.cloud.lastSaved', {
                        date: new Intl.DateTimeFormat(getLocale(), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'Asia/Baghdad',
                        }).format(new Date(lastSyncedAt)),
                      })}
                    </p>
                  )}
                </div>
              </div>
              {syncError && <p className="form-error">{localizeMessage(syncError)}</p>}
              <p className="settings-description">{t('settings.sync.description')}</p>
              {['offline', 'error'].includes(syncStatus) && (
                <button className="button secondary" onClick={retrySync}>
                  <RefreshCw size={16} />
                  {t('settings.sync.retry')}
                </button>
              )}
              {syncStatus === 'conflict' && (
                <div className="conflict-actions">
                  <p>{t('settings.sync.conflictDescription')}</p>
                  <button className="button secondary" onClick={() => setConfirmation('reload')}>
                    {t('settings.sync.reload')}
                  </button>
                  <button
                    className="button danger-outline"
                    onClick={() => setConfirmation('overwrite')}
                  >
                    {t('settings.sync.overwrite')}
                  </button>
                </div>
              )}
              <form className="password-settings" onSubmit={(e) => void savePassword(e)}>
                <h3>
                  <KeyRound size={18} />
                  {t('settings.password.title')}
                </h3>
                <div className="form-grid">
                  <label className="form-field">
                    {t('settings.password.new')}
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
                    {t('settings.password.confirm')}
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
                    {localizeMessage(accountError)}
                  </p>
                )}
                <button className="button secondary" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? t('settings.password.busy') : t('settings.password.title')}
                </button>
              </form>
            </Card>
          )}

          <Card title={t('settings.profile.title')}>
            <form onSubmit={save}>
              <div className="profile-preview">
                <span className="avatar avatar-large">
                  {name.charAt(0) || t('settings.profile.avatarFallback')}
                </span>
                <div>
                  <h3>{name || t('settings.profile.space')}</h3>
                  <p>{role}</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  {t('settings.profile.name')}
                  <input
                    required
                    maxLength={50}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  {t('settings.profile.role')}
                  <input maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} />
                </label>
                <label className="form-field">
                  {t('settings.profile.weekly')}
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
                  {t('settings.profile.focus')}
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
                  {localizeMessage(profileError)}
                </p>
              )}
              <div className="form-actions">
                <button className="button primary" type="submit">
                  {t('settings.profile.save')}
                </button>
                <span className="helper-text">{t('settings.profile.focusNote')}</span>
              </div>
            </form>
          </Card>
          <Card title={t('settings.appearance.title')}>
            <p className="settings-description">{t('settings.appearance.description')}</p>
            <div className="theme-options">
              <button
                className={`theme-option ${data.profile.theme === 'light' ? 'selected' : ''}`}
                onClick={() => updateProfile({ theme: 'light' })}
                aria-pressed={data.profile.theme === 'light'}
              >
                <Sun size={22} />
                <span>{t('settings.appearance.light')}</span>
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
                <span>{t('settings.appearance.dark')}</span>
                <div className="theme-preview dark-preview">
                  <i />
                  <i />
                  <i />
                </div>
              </button>
            </div>
          </Card>
          <Card title={t('settings.backup.title')}>
            <div className="backup-description">
              <HardDrive size={25} />
              <div>
                <h3>{t('settings.backup.heading')}</h3>
                <p>
                  {isCloud
                    ? t('settings.backup.cloudDescription')
                    : t('settings.backup.localDescription')}
                </p>
              </div>
            </div>
            <div className="backup-actions">
              <button className="button primary" onClick={exportBackup}>
                <Download size={16} />
                {t('settings.backup.download')}
              </button>
              <button className="button secondary" onClick={() => inputRef.current?.click()}>
                <Upload size={16} />
                {t('settings.backup.restore')}
              </button>
              {isCloud && (
                <button className="button secondary" onClick={importBrowserData}>
                  <Upload size={16} />
                  {t('settings.backup.importLegacy')}
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
                {localizeMessage(error)}
              </p>
            )}
            <div className="data-counts">
              <span>
                {t('settings.backup.tasks', {
                  count: data.tasks.length.toLocaleString(getLocale()),
                })}
              </span>
              <span>
                {t('settings.backup.skills', {
                  count: data.skills.length.toLocaleString(getLocale()),
                })}
              </span>
              <span>
                {t('settings.backup.activities', {
                  count: data.entries.length.toLocaleString(getLocale()),
                })}
              </span>
              <span>
                {t('settings.backup.events', {
                  count: data.events.length.toLocaleString(getLocale()),
                })}
              </span>
            </div>
          </Card>
          <Card className="danger-zone" title={t('settings.data.title')}>
            <div className="settings-action-row">
              <div>
                <h3>{t('settings.data.clearTitle')}</h3>
                <p>{t('settings.data.clearDescription')}</p>
              </div>
              <button className="button danger-outline" onClick={() => setConfirmation('clear')}>
                <Trash2 size={15} />
                {t('settings.data.clear')}
              </button>
            </div>
            <div className="settings-action-row">
              <div>
                <h3>{t('settings.data.demoTitle')}</h3>
                <p>{t('settings.data.demoDescription')}</p>
              </div>
              <button className="button secondary" onClick={() => setConfirmation('demo')}>
                <RefreshCw size={15} />
                {t('settings.data.demo')}
              </button>
            </div>
          </Card>
        </div>
        <aside className="settings-aside">
          <div className="privacy-card">
            <ShieldCheck size={31} />
            <h2>{t('settings.privacy.title')}</h2>
            <p>
              {isCloud
                ? t('settings.privacy.cloudDescription')
                : t('settings.privacy.localDescription')}
            </p>
            <div>
              <UserRound size={15} />
              {isCloud ? t('settings.privacy.cloudAccount') : t('settings.privacy.localAccount')}
            </div>
            <div>
              <Cloud size={15} />
              {isCloud ? t('settings.privacy.cloudSync') : t('settings.privacy.localSync')}
            </div>
            <span>
              {isCloud ? t('settings.privacy.cloudNote') : t('settings.privacy.localNote')}
            </span>
          </div>
          <Card title={t('settings.hosting.title')}>
            <p className="settings-description">{t('settings.hosting.description')}</p>
            <a
              className="text-link"
              href="https://pages.cloudflare.com/"
              target="_blank"
              rel="noreferrer"
            >
              {t('settings.hosting.visit')}
              <ExternalLink size={14} />
            </a>
            <div className="hosting-note">
              {t('settings.hosting.build')} <code dir="ltr">npm run build</code>
              <br />
              {t('settings.hosting.output')} <code>dist</code>
            </div>
          </Card>
          <Card title={t('settings.tip.title')}>
            <CircleHelp size={22} />
            <p className="settings-description">{t('settings.tip.description')}</p>
          </Card>
        </aside>
      </div>
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation === 'overwrite'
              ? t('settings.confirm.overwrite.title')
              : confirmation === 'reload'
                ? t('settings.confirm.reload.title')
                : confirmation === 'import'
                  ? t('settings.confirm.import.title')
                  : confirmation === 'clear'
                    ? t('settings.confirm.clear.title')
                    : t('settings.confirm.demo.title')
          }
          description={
            confirmation === 'overwrite'
              ? t('settings.confirm.overwrite.description')
              : confirmation === 'reload'
                ? t('settings.confirm.reload.description')
                : confirmation === 'import'
                  ? t('settings.confirm.import.description')
                  : t('settings.confirm.data.description')
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
