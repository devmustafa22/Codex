import { getLocale, localizeMessage } from './lib/i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useLanguage } from './state/LanguageContext';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ListTodo,
  Sprout,
  CalendarDays,
  BookOpen,
  ChartNoAxesCombined,
  Settings2,
  Search,
  Bell,
  PanelRightClose,
  Menu,
  ArrowUpLeft,
  CircleHelp,
  ChevronDown,
  Check,
  Sparkles,
  MoreHorizontal,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogOut,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from './state/AppContext';
import { useAuth } from './state/AuthContext';
import type { PageId } from './lib/types';
import { todayKey, formatDate } from './lib/dates';
import { Brand } from './components/Brand';
import { ConfirmDialog, Modal } from './components/ui';
import { SearchDialog } from './components/SearchDialog';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import SkillsPage from './pages/SkillsPage';
import CalendarPage from './pages/CalendarPage';
import JournalPage from './pages/JournalPage';
import InsightsPage from './pages/InsightsPage';
import SettingsPage from './pages/SettingsPage';
const AdminPage = lazy(() => import('./pages/AdminPage'));
const navigation: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'shell.nav.dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'shell.nav.tasks', icon: ListTodo },
  { id: 'skills', label: 'shell.nav.skills', icon: Sprout },
  { id: 'calendar', label: 'shell.nav.calendar', icon: CalendarDays },
  { id: 'journal', label: 'shell.nav.journal', icon: BookOpen },
  { id: 'insights', label: 'shell.nav.insights', icon: ChartNoAxesCombined },
];
const mobileNavigation: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'shell.mobile.home', icon: LayoutDashboard },
  { id: 'tasks', label: 'shell.mobile.tasks', icon: ListTodo },
  { id: 'calendar', label: 'shell.nav.calendar', icon: CalendarDays },
  { id: 'journal', label: 'shell.mobile.journal', icon: BookOpen },
];
const syncLabels = {
  loading: 'shell.sync.loading',
  synced: 'shell.sync.synced',
  saving: 'shell.sync.saving',
  offline: 'shell.sync.offline',
  error: 'shell.sync.error',
  conflict: 'shell.sync.conflict',
  local: 'shell.sync.local',
};
export default function App() {
  const { t, language } = useLanguage();
  const { data, page, setPage, syncStatus, syncError, lastSyncedAt, notify, updateProfile } =
    useApp();
  const { mode, accountAccess, signOut, leaveDemo } = useAuth();
  const isAdmin =
    mode === 'cloud' && accountAccess?.role === 'admin' && accountAccess.status === 'active';
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const syncLabel = t(syncLabels[syncStatus]);
  const syncPending = ['saving', 'offline', 'error', 'conflict'].includes(syncStatus);
  const SyncIcon =
    syncStatus === 'local'
      ? HardDrive
      : ['loading', 'saving'].includes(syncStatus)
        ? LoaderCircle
        : ['offline', 'error', 'conflict'].includes(syncStatus)
          ? CloudOff
          : Cloud;
  const today = todayKey();
  useEffect(() => {
    if (page === 'admin' && !isAdmin) setPage('dashboard');
  }, [page, isAdmin, setPage]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setSidebarOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const reminders = data.tasks.filter((t) => t.status !== 'done' && t.dueDate <= today);
  const navTo = (id: PageId) => {
    setPage(id);
    setSidebarOpen(false);
    setNotificationsOpen(false);
    if (isMobile) requestAnimationFrame(() => document.getElementById('main-content')?.focus());
  };
  async function endSession() {
    if (mode === 'demo') {
      leaveDemo();
      return;
    }
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      notify(error instanceof Error ? localizeMessage(error.message) : t('shell.signOut.error'));
    } finally {
      setSigningOut(false);
    }
  }
  function requestSignOut() {
    setSidebarOpen(false);
    if (mode === 'cloud' && syncPending) setConfirmSignOut(true);
    else void endSession();
  }
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const drawer = sidebarRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const targets = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]') ??
          [],
      ).filter((element) => element.getClientRects().length > 0);
    targets()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = targets();
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', trapFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [isMobile, sidebarOpen]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!document.querySelector('[role="dialog"]')) setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    const titleKey =
      page === 'admin'
        ? 'shell.nav.admin'
        : page === 'settings'
          ? 'shell.nav.settings'
          : (navigation.find((item) => item.id === page)?.label ?? 'shell.brand.name');
    document.title = `${t(titleKey)} — ${t('shell.brand.name')}`;
  }, [page, language, t]);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {t('shell.nav.skip')}
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label={t('shell.nav.close')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="app-sidebar"
        className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}
        inert={isMobile && !sidebarOpen}
        role={isMobile && sidebarOpen ? 'dialog' : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-label={t('shell.nav.navigation')}
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label={t('shell.nav.close')}
            onClick={() => setSidebarOpen(false)}
          >
            <PanelRightClose size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" />
          {t('shell.nav.workspace')}
          <ChevronDown size={14} />
        </div>
        <span className="nav-section-label">{t('shell.nav.primarySection')}</span>
        <nav aria-label={t('shell.nav.primary')}>
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => navTo(item.id)}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={19} />
              <span>{t(item.label)}</span>
              {item.id === 'tasks' && reminders.length > 0 && (
                <span className="nav-count">{reminders.length}</span>
              )}
              {page === item.id && item.id !== 'tasks' && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-secondary">
          <span className="nav-section-label">{t('shell.nav.secondarySection')}</span>
          {isAdmin && (
            <button
              className={`nav-item ${page === 'admin' ? 'active' : ''}`}
              onClick={() => navTo('admin')}
              aria-current={page === 'admin' ? 'page' : undefined}
            >
              <ShieldCheck size={19} />
              <span>{t('shell.nav.admin')}</span>
            </button>
          )}
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navTo('settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <Settings2 size={19} />
            <span>{t('shell.nav.settings')}</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={19} />
            <span>{t('shell.nav.help')}</span>
            <ArrowUpLeft size={14} />
          </button>
          <button className="nav-item" onClick={requestSignOut} disabled={signingOut}>
            <LogOut size={19} />
            <span>{mode === 'demo' ? t('shell.signOut.demo') : t('shell.signOut.cloud')}</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-inspiration">
            <div className="inspiration-orbit" aria-hidden="true" />
            <span className="inspiration-icon">
              <Sprout size={23} />
            </span>
            <h3>
              {t('shell.inspiration.line1')}
              <br />
              {t('shell.inspiration.line2')}
            </h3>
            <p>
              {t('shell.inspiration.description1')}
              <br />
              {t('shell.inspiration.description2')}
            </p>
            <button onClick={() => navTo('skills')}>
              {t('shell.inspiration.explore')}
              <ArrowUpLeft size={15} />
            </button>
          </div>
          <button className="sidebar-profile" onClick={() => navTo('settings')}>
            <span className="avatar">{data.profile.name.charAt(0)}</span>
            <div>
              <strong>{data.profile.name}</strong>
              <span>{t('shell.profile.workspace')}</span>
            </div>
            <Settings2 size={16} />
          </button>
          <div className={`local-save sync-${syncStatus}`} role="status">
            <SyncIcon size={14} className={syncStatus === 'saving' ? 'sync-spinning' : ''} />
            {syncLabel}
          </div>
        </div>
      </aside>
      <div className="app-main" inert={isMobile && sidebarOpen}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={t('shell.nav.open')}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={18} />
            <span>{t('shell.search.topbar')}</span>
            <kbd dir="ltr">⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button
              className={`sync-indicator sync-${syncStatus}`}
              onClick={() => navTo('settings')}
              aria-label={t('shell.sync.openSettings', { status: syncLabel })}
              title={
                (syncError ? localizeMessage(syncError) : null) ||
                (lastSyncedAt
                  ? t('shell.sync.lastSync', {
                      status: syncLabel,
                      time: new Date(lastSyncedAt).toLocaleTimeString(getLocale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : syncLabel)
              }
            >
              <SyncIcon
                size={17}
                className={['loading', 'saving'].includes(syncStatus) ? 'sync-spinning' : ''}
              />
              <span>{syncLabel}</span>
            </button>
            <LanguageSwitcher onChange={(value) => updateProfile({ language: value })} />
            <span className="topbar-date">
              <CalendarDays size={16} />
              {formatDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notificationsOpen ? 'is-active' : ''}`}
                aria-label={t('shell.notifications.tasks')}
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((o) => !o)}
              >
                <Bell size={19} />
                {reminders.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <>
                  <button
                    className="popover-dismiss"
                    tabIndex={-1}
                    aria-label={t('shell.notifications.close')}
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="notifications-popover">
                    <div className="card-heading">
                      <h2>{t('shell.notifications.today')}</h2>
                      <span className="badge">{reminders.length}</span>
                    </div>
                    {reminders.slice(0, 5).map((task) => (
                      <button key={task.id} onClick={() => navTo('tasks')}>
                        <span className={`reminder-dot priority-${task.priority}`} />
                        <div>
                          <strong>{task.title}</strong>
                          <span>
                            {task.dueDate < today
                              ? t('shell.notifications.overdue')
                              : t('shell.notifications.dueToday')}
                            {formatDate(task.dueDate)}
                          </span>
                        </div>
                        <ArrowUpLeft size={13} />
                      </button>
                    ))}
                    {reminders.length === 0 && (
                      <p className="mini-empty">
                        <Check size={18} />
                        {t('shell.notifications.empty')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <span className="topbar-divider" />
            <button
              className="topbar-profile"
              aria-label={t('shell.profile.open')}
              onClick={() => navTo('settings')}
            >
              <span className="avatar small">{data.profile.name.charAt(0)}</span>
              <div>
                <strong>{data.profile.name}</strong>
                <span>{t('shell.profile.welcome')}</span>
              </div>
            </button>
          </div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div hidden={page !== 'dashboard'}>
            <DashboardPage />
          </div>
          {page === 'tasks' && <TasksPage />}
          {page === 'skills' && <SkillsPage />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'journal' && <JournalPage />}
          {page === 'insights' && <InsightsPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'admin' && isAdmin && (
            <Suspense
              fallback={
                <section className="workspace-loading" role="status">
                  {t('shell.admin.loading')}
                </section>
              }
            >
              <AdminPage />
            </Suspense>
          )}
          <footer className="app-footer">
            <span>{t('shell.footer.tagline')}</span>
            <span>
              <Sparkles size={12} />
              {t('shell.brand.name')} <span dir="ltr">2.0</span>
            </span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-bottom-nav"
        aria-label={t('shell.nav.quick')}
        inert={isMobile && sidebarOpen}
      >
        {mobileNavigation.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => navTo(item.id)}
          >
            <item.icon size={21} />
            <span>{t(item.label)}</span>
          </button>
        ))}
        <button
          className={mobileNavigation.some((item) => item.id === page) ? '' : 'active'}
          aria-current={mobileNavigation.some((item) => item.id === page) ? undefined : 'page'}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          onClick={() => setSidebarOpen(true)}
        >
          <MoreHorizontal size={21} />
          <span>{t('shell.mobile.more')}</span>
        </button>
      </nav>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}{' '}
      {confirmSignOut && (
        <ConfirmDialog
          title={t('shell.signOut.pendingTitle')}
          description={t('shell.signOut.pendingDescription')}
          onConfirm={() => void endSession()}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
      {helpOpen && (
        <Modal title={t('shell.help.title')} onClose={() => setHelpOpen(false)}>
          <p className="form-description">
            {mode === 'demo' ? t('shell.help.demo') : t('shell.help.cloud')}
          </p>
          <ol className="help-steps">
            <li>
              <strong>{t('shell.help.skillsTitle')}</strong>
              <span>{t('shell.help.skillsDescription')}</span>
            </li>
            <li>
              <strong>{t('shell.help.planTitle')}</strong>
              <span>{t('shell.help.planDescription')}</span>
            </li>
            <li>
              <strong>{t('shell.help.logTitle')}</strong>
              <span>{t('shell.help.logDescription')}</span>
            </li>
            <li>
              <strong>{t('shell.help.reviewTitle')}</strong>
              <span>
                {mode === 'demo' ? t('shell.help.reviewDemo') : t('shell.help.reviewCloud')}
              </span>
            </li>
          </ol>
          <button
            className="button primary"
            onClick={() => {
              setHelpOpen(false);
              navTo('skills');
            }}
          >
            {t('shell.help.start')}
            <ArrowUpLeft size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
