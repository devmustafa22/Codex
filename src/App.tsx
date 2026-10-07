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
  { id: 'dashboard', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'tasks', label: 'مهامي', icon: ListTodo },
  { id: 'skills', label: 'مهاراتي', icon: Sprout },
  { id: 'calendar', label: 'التقويم', icon: CalendarDays },
  { id: 'journal', label: 'سجلّ الرحلة', icon: BookOpen },
  { id: 'insights', label: 'التحليلات', icon: ChartNoAxesCombined },
];
const mobileNavigation: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'tasks', label: 'المهام', icon: ListTodo },
  { id: 'calendar', label: 'التقويم', icon: CalendarDays },
  { id: 'journal', label: 'السجلّ', icon: BookOpen },
];
const syncLabels = {
  loading: 'جارٍ تحميل بياناتك',
  synced: 'محفوظ في السحابة',
  saving: 'جارٍ الحفظ في السحابة',
  offline: 'غير متصل بالسحابة',
  error: 'تعذرت المزامنة',
  conflict: 'تعارض يحتاج مراجعتك',
  local: 'تجربة محلية — على هذا الجهاز',
};
export default function App() {
  const { data, page, setPage, syncStatus, syncError, lastSyncedAt, notify } = useApp();
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
  const syncLabel = syncLabels[syncStatus];
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
      notify(error instanceof Error ? error.message : 'تعذر تسجيل الخروج. جرّب مرة ثانية.');
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
    document.title = `${page === 'admin' ? 'إدارة الحسابات' : page === 'settings' ? 'الإعدادات' : (navigation.find((n) => n.id === page)?.label ?? 'مدار')} — مدار`;
  }, [page]);
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
        انتقل إلى المحتوى
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="إغلاق القائمة"
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
        aria-label="التنقل في مدار"
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="إغلاق القائمة"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelRightClose size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" />
          مساحتي الشخصية
          <ChevronDown size={14} />
        </div>
        <span className="nav-section-label">في مدارك</span>
        <nav aria-label="القائمة الرئيسية">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => navTo(item.id)}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'tasks' && reminders.length > 0 && (
                <span className="nav-count">{reminders.length}</span>
              )}
              {page === item.id && item.id !== 'tasks' && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-secondary">
          <span className="nav-section-label">مساحتك</span>
          {isAdmin && (
            <button
              className={`nav-item ${page === 'admin' ? 'active' : ''}`}
              onClick={() => navTo('admin')}
              aria-current={page === 'admin' ? 'page' : undefined}
            >
              <ShieldCheck size={19} />
              <span>إدارة الحسابات</span>
            </button>
          )}
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navTo('settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <Settings2 size={19} />
            <span>الإعدادات</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={19} />
            <span>دليل البداية</span>
            <ArrowUpLeft size={14} />
          </button>
          <button className="nav-item" onClick={requestSignOut} disabled={signingOut}>
            <LogOut size={19} />
            <span>{mode === 'demo' ? 'إنهاء التجربة' : 'تسجيل الخروج'}</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-inspiration">
            <div className="inspiration-orbit" aria-hidden="true" />
            <span className="inspiration-icon">
              <Sprout size={23} />
            </span>
            <h3>
              كل خطوة
              <br />
              تُحدث فرقاً.
            </h3>
            <p>
              مو لازم تكون الأسرع،
              <br />
              المهم تبقى في الطريق.
            </p>
            <button onClick={() => navTo('skills')}>
              اكتشف تقدّمك
              <ArrowUpLeft size={15} />
            </button>
          </div>
          <button className="sidebar-profile" onClick={() => navTo('settings')}>
            <span className="avatar">{data.profile.name.charAt(0)}</span>
            <div>
              <strong>{data.profile.name}</strong>
              <span>مساحتك الشخصية</span>
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
            aria-label="فتح القائمة"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={18} />
            <span>ابحث عن مهمة، مهارة أو نشاط...</span>
            <kbd dir="ltr">⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button
              className={`sync-indicator sync-${syncStatus}`}
              onClick={() => navTo('settings')}
              aria-label={`${syncLabel}. افتح إعدادات الحساب والمزامنة`}
              title={
                syncError ||
                (lastSyncedAt
                  ? `${syncLabel} · آخر مزامنة ${new Date(lastSyncedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`
                  : syncLabel)
              }
            >
              <SyncIcon
                size={17}
                className={['loading', 'saving'].includes(syncStatus) ? 'sync-spinning' : ''}
              />
              <span>{syncLabel}</span>
            </button>
            <span className="topbar-date">
              <CalendarDays size={16} />
              {formatDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notificationsOpen ? 'is-active' : ''}`}
                aria-label="تذكيرات المهام"
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
                    aria-label="إغلاق التذكيرات"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="notifications-popover">
                    <div className="card-heading">
                      <h2>تذكيراتك اليوم</h2>
                      <span className="badge">{reminders.length}</span>
                    </div>
                    {reminders.slice(0, 5).map((t) => (
                      <button key={t.id} onClick={() => navTo('tasks')}>
                        <span className={`reminder-dot priority-${t.priority}`} />
                        <div>
                          <strong>{t.title}</strong>
                          <span>
                            {t.dueDate < today ? 'متأخرة · ' : 'اليوم · '}
                            {formatDate(t.dueDate)}
                          </span>
                        </div>
                        <ArrowUpLeft size={13} />
                      </button>
                    ))}
                    {reminders.length === 0 && (
                      <p className="mini-empty">
                        <Check size={18} />
                        كل شيء تحت السيطرة، ما عندك مهام متأخرة.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <span className="topbar-divider" />
            <button
              className="topbar-profile"
              aria-label="فتح الملف الشخصي"
              onClick={() => navTo('settings')}
            >
              <span className="avatar small">{data.profile.name.charAt(0)}</span>
              <div>
                <strong>{data.profile.name}</strong>
                <span>أهلاً في مساحتك</span>
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
                  نحمّل إدارة الحسابات…
                </section>
              }
            >
              <AdminPage />
            </Suspense>
          )}
          <footer className="app-footer">
            <span>صُنع لرحلتك، على وتيرتك.</span>
            <span>
              <Sparkles size={12} />
              مدار <span dir="ltr">2.0</span>
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="التنقل السريع" inert={isMobile && sidebarOpen}>
        {mobileNavigation.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => navTo(item.id)}
          >
            <item.icon size={21} />
            <span>{item.label}</span>
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
          <span>المزيد</span>
        </button>
      </nav>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}{' '}
      {confirmSignOut && (
        <ConfirmDialog
          title="تغييرات بانتظار المزامنة"
          description="بعض التغييرات لم تصل إلى السحابة بعد. تبقى نسخة استعادة محلية لهذا الحساب على هذا المتصفح. نوصيك بتنزيل نسخة من الإعدادات قبل الخروج، ثم تسجيل الدخول هنا لمتابعة المزامنة. تريد تسجيل الخروج الآن؟"
          onConfirm={() => void endSession()}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
      {helpOpen && (
        <Modal title="أهلاً في مدار 🌿" onClose={() => setHelpOpen(false)}>
          <p className="form-description">
            {mode === 'demo'
              ? 'هذه تجربة محلية ببيانات مثال. تُحفظ تغييرات التجربة على هذا المتصفح. أنشئ حسابك عندما تكون جاهزاً لحفظ رحلتك في السحابة.'
              : 'هذه مساحتك للنمو. مهامك ومهاراتك وسجلّك مرتبطة بحسابك، وتصل لأجهزتك الأخرى بعد نجاح المزامنة.'}
          </p>
          <ol className="help-steps">
            <li>
              <strong>اختَر مهاراتك</strong>
              <span>حدّد هدفاً بالساعات، ورصيدك السابق إذا عندك خبرة.</span>
            </li>
            <li>
              <strong>خطّط لخطواتك</strong>
              <span>أضف مهاماً ومواعيد، واربطها بالمهارة اللي تريد تطورها.</span>
            </li>
            <li>
              <strong>سجّل ما أنجزت</strong>
              <span>
                الأنشطة وجلسات التركيز تزيد وقت المهارة. إكمال مهمة يحدّث الإنجاز، ويُسجّل وقتها من
                السجل أو المؤقّت.
              </span>
            </li>
            <li>
              <strong>راجع واحتفظ بنسخة</strong>
              <span>
                {mode === 'demo'
                  ? 'شوف تحليلاتك أسبوعياً، ونزّل نسخة من الإعدادات للاحتفاظ ببيانات هذه التجربة.'
                  : 'شوف تحليلاتك أسبوعياً، وتابع حالة المزامنة. تقدر تنزّل نسخة إضافية من الإعدادات.'}
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
            خلّينا نبدأ
            <ArrowUpLeft size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
