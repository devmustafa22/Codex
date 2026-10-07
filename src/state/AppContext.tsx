import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type {
  AppData,
  CalendarEvent,
  JournalEntry,
  NewEntry,
  NewEvent,
  NewSkill,
  NewTask,
  PageId,
  Profile,
  Skill,
  Task,
} from '../lib/types';
import { createDemoData } from '../lib/seed';
import { todayKey } from '../lib/dates';
import { loadData, parseBackup, STORAGE_KEY } from '../lib/storage';
import { useAuth } from './AuthContext';
import { useCloudWorkspace } from './useCloudWorkspace';
import { useLanguage } from './LanguageContext';
import { t, localizeMessage } from '../lib/i18n';
export interface SelectedItem {
  page: PageId;
  id: string;
}
export type SyncStatus =
  'local' | 'loading' | 'synced' | 'saving' | 'offline' | 'error' | 'conflict';
interface AppContextValue {
  syncStatus: SyncStatus;
  syncError: string;
  lastSyncedAt: string | null;
  retrySync: () => void;
  resolveSyncConflict: (strategy: 'reload' | 'overwrite') => Promise<void>;
  data: AppData;
  page: PageId;
  setPage: (page: PageId) => void;
  selectedItem: SelectedItem | null;
  openItem: (page: PageId, id: string) => void;
  clearSelectedItem: () => void;
  notify: (message: string) => void;
  addTask: (task: NewTask) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addSkill: (skill: NewSkill) => string;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  addEntry: (entry: NewEntry) => string;
  updateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  deleteEntry: (id: string) => void;
  addEvent: (event: NewEvent) => string;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  importBackup: (text: string) => void;
  clearData: () => void;
  resetDemo: () => void;
}
const AppContext = createContext<AppContextValue | null>(null);
const pages: PageId[] = [
  'dashboard',
  'tasks',
  'skills',
  'calendar',
  'journal',
  'insights',
  'settings',
  'admin',
];
export function AppProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useAuth();
  return mode === 'cloud' && user ? (
    <CloudAppProvider
      key={user.id}
      userId={user.id}
      name={String(user.user_metadata.display_name || t('common.mySpace'))}
    >
      {children}
    </CloudAppProvider>
  ) : (
    <LocalAppProvider>{children}</LocalAppProvider>
  );
}
function LocalAppProvider({ children }: { children: ReactNode }) {
  const initial = useState(loadData)[0];
  const [data, setData] = useState<AppData>(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [blocked, setBlocked] = useState(Boolean(initial.error));
  useEffect(() => {
    if (blocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError('');
    } catch {
      setStorageError(t('common.localSaveError'));
    }
  }, [data, blocked]);
  const replaceData = (next: AppData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setData(next);
    setStorageError('');
    setBlocked(false);
  };
  return (
    <WorkspaceProvider
      data={data}
      setData={setData}
      replaceData={replaceData}
      syncStatus="local"
      syncError={storageError}
      lastSyncedAt={null}
      retrySync={() => {}}
      resolveSyncConflict={async () => {}}
    >
      {children}
    </WorkspaceProvider>
  );
}
function CloudAppProvider({
  children,
  userId,
  name,
}: {
  children: ReactNode;
  userId: string;
  name: string;
}) {
  const workspace = useCloudWorkspace({ userId, name });
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const [signOutError, setSignOutError] = useState('');
  if (!workspace.ready)
    return (
      <main className="workspace-loading" aria-busy={workspace.status === 'loading'}>
        <h1>
          {t(
            workspace.status === 'loading'
              ? 'common.openingWorkspace'
              : 'common.workspaceLoadFailed',
          )}
        </h1>
        <p role={workspace.error ? 'alert' : undefined}>
          {localizeMessage(workspace.error) || t('common.loadingWorkspace')}
        </p>
        {workspace.status !== 'loading' && (
          <button className="button primary" onClick={workspace.retry}>
            {t('common.retry')}
          </button>
        )}
        <button
          className="button secondary"
          onClick={() => void signOut().catch(() => setSignOutError(t('common.signOutFailed')))}
        >
          {t('common.signOut')}
        </button>
        {signOutError && <p role="alert">{localizeMessage(signOutError)}</p>}
      </main>
    );
  return (
    <WorkspaceProvider
      data={workspace.data}
      setData={workspace.setData}
      replaceData={(next) => workspace.setData(next)}
      syncStatus={workspace.status}
      syncError={workspace.error}
      lastSyncedAt={workspace.lastSaved}
      retrySync={workspace.retry}
      resolveSyncConflict={workspace.resolveConflict}
    >
      {children}
    </WorkspaceProvider>
  );
}
interface WorkspaceProviderProps {
  children: ReactNode;
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  replaceData: (data: AppData) => void;
  syncStatus: SyncStatus;
  syncError: string;
  lastSyncedAt: string | null;
  retrySync: () => void;
  resolveSyncConflict: (strategy: 'reload' | 'overwrite') => Promise<void>;
}
function WorkspaceProvider({
  children,
  data,
  setData,
  replaceData,
  syncStatus,
  syncError,
  lastSyncedAt,
  retrySync,
  resolveSyncConflict,
}: WorkspaceProviderProps) {
  const { setLanguage, t } = useLanguage();
  const [toast, setToast] = useState<string>('');
  const [page, updatePage] = useState<PageId>(
    () => pages.find((p) => `#${p}` === window.location.hash) ?? 'dashboard',
  );
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const setPage = useCallback((next: PageId) => {
    setSelectedItem(null);
    updatePage(next);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);
  const openItem = useCallback(
    (next: PageId, id: string) => {
      setPage(next);
      setSelectedItem({ page: next, id });
    },
    [setPage],
  );
  const clearSelectedItem = useCallback(() => setSelectedItem(null), []);
  useEffect(() => {
    const update = () =>
      updatePage(pages.find((p) => `#${p}` === window.location.hash) ?? 'dashboard');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.profile.theme;
  }, [data.profile.theme]);
  useEffect(() => {
    document.documentElement.dataset.textSize = data.profile.textSize ?? 'normal';
  }, [data.profile.textSize]);
  useEffect(() => {
    if (data.profile.language) setLanguage(data.profile.language);
  }, [data.profile.language, setLanguage]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timer);
  }, [toast]);
  const addTask = (input: NewTask) => {
    const id = crypto.randomUUID();
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          ...input,
          id,
          createdAt: todayKey(),
          ...(input.status === 'done' ? { completedAt: todayKey() } : {}),
        },
      ],
    }));
    notify(t('common.taskAdded'));
    return id;
  };
  const updateTask = (id: string, patch: Partial<Task>) =>
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id !== id
          ? t
          : {
              ...t,
              ...patch,
              ...(patch.status
                ? {
                    completedAt:
                      patch.status === 'done' ? (t.completedAt ?? todayKey()) : undefined,
                  }
                : {}),
            },
      ),
    }));
  const deleteTask = (id: string) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    notify(t('common.taskDeleted'));
  };
  const addSkill = (input: NewSkill) => {
    const id = crypto.randomUUID();
    setData((d) => ({ ...d, skills: [...d.skills, { ...input, id }] }));
    notify(t('common.skillAdded'));
    return id;
  };
  const updateSkill = (id: string, patch: Partial<Skill>) =>
    setData((d) => ({ ...d, skills: d.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const deleteSkill = (id: string) => {
    setData((d) => ({
      ...d,
      skills: d.skills.filter((s) => s.id !== id),
      tasks: d.tasks.map((t) => (t.skillId === id ? { ...t, skillId: '' } : t)),
      entries: d.entries.map((e) => (e.skillId === id ? { ...e, skillId: '' } : e)),
      events: d.events.map((e) => (e.skillId === id ? { ...e, skillId: '' } : e)),
    }));
    notify(t('common.skillDeleted'));
  };
  const addEntry = (input: NewEntry) => {
    const id = crypto.randomUUID();
    setData((d) => ({ ...d, entries: [...d.entries, { ...input, id }] }));
    notify(t('common.activitySaved'));
    return id;
  };
  const updateEntry = (id: string, patch: Partial<JournalEntry>) =>
    setData((d) => ({
      ...d,
      entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  const deleteEntry = (id: string) => {
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
    notify(t('common.activityDeleted'));
  };
  const addEvent = (input: NewEvent) => {
    const id = crypto.randomUUID();
    setData((d) => ({ ...d, events: [...d.events, { ...input, id }] }));
    notify(t('common.eventAdded'));
    return id;
  };
  const updateEvent = (id: string, patch: Partial<CalendarEvent>) =>
    setData((d) => ({ ...d, events: d.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const deleteEvent = (id: string) => {
    setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
    notify(t('common.eventDeleted'));
  };
  const updateProfile = (patch: Partial<Profile>) => {
    setData((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
    notify(t('common.settingsSaved'));
  };
  const importBackup = (text: string) => {
    replaceData(parseBackup(text));
    notify(t('common.backupRestored'));
  };
  const clearData = () => {
    replaceData({
      version: 1,
      profile: data.profile,
      tasks: [],
      skills: [],
      entries: [],
      events: [],
    });
    notify(t('common.spaceCleared'));
  };
  const resetDemo = () => {
    replaceData(createDemoData());
    notify(t('common.demoRestored'));
  };
  return (
    <AppContext.Provider
      value={{
        data,
        syncStatus,
        syncError,
        lastSyncedAt,
        retrySync,
        resolveSyncConflict,
        page,
        setPage,
        selectedItem,
        openItem,
        clearSelectedItem,
        notify,
        addTask,
        updateTask,
        deleteTask,
        addSkill,
        updateSkill,
        deleteSkill,
        addEntry,
        updateEntry,
        deleteEntry,
        addEvent,
        updateEvent,
        deleteEvent,
        updateProfile,
        importBackup,
        clearData,
        resetDemo,
      }}
    >
      {syncError && (
        <div className="storage-warning" role="alert">
          {localizeMessage(syncError)}
          {syncStatus !== 'local' && (
            <button onClick={() => setPage('settings')}>{t('common.openSyncSettings')}</button>
          )}
        </div>
      )}
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {localizeMessage(toast)}
        </div>
      )}
    </AppContext.Provider>
  );
}
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
