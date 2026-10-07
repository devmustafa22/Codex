import { getLanguage, t } from './i18n';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseBackup } from './storage';
import type { AppData } from './types';

export type CloudStatus = 'loading' | 'synced' | 'saving' | 'offline' | 'error' | 'conflict';

export interface WorkspaceSnapshot {
  data: AppData;
  ready: boolean;
  status: CloudStatus;
  error: string;
  lastSaved: string | null;
}

export interface WorkspaceRow {
  user_id: string;
  payload: unknown;
  revision: number;
  updated_at: string;
}

export interface WorkspaceBackend {
  load(): Promise<WorkspaceRow | null>;
  save(data: AppData, expectedRevision: number): Promise<WorkspaceRow>;
}

export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WorkspaceCache {
  version: 1;
  data: AppData;
  baseRevision: number;
  dirty: boolean;
}

export class WorkspaceError extends Error {
  constructor(
    public readonly kind: 'offline' | 'error' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/** Bind both reads and writes to the account that mounted this workspace. */
export function createWorkspaceBackend(client: SupabaseClient, userId: string): WorkspaceBackend {
  return {
    async load() {
      const { data, error } = await client
        .from('user_workspaces')
        .select('user_id,payload,revision,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw backendError(error);
      return data as WorkspaceRow | null;
    },
    async save(payload, expectedRevision) {
      const { data, error } = await client.rpc('save_workspace', {
        p_payload: payload,
        p_expected_revision: expectedRevision,
        p_user_id: userId,
      });
      if (error) throw backendError(error);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new WorkspaceError('error', t('auth.cloudSaveUnconfirmed'));
      return row as WorkspaceRow;
    },
  };
}

function backendError(error: { code?: string; message: string }): WorkspaceError {
  if (error.code === '40001' || error.message.includes('workspace_conflict')) {
    return new WorkspaceError('conflict', 'workspace_conflict');
  }
  if (!error.code || error.message.toLowerCase().includes('fetch')) {
    return new WorkspaceError('offline', t('auth.cloudRetryPending'));
  }
  return new WorkspaceError('error', t('auth.cloudDataFailed'));
}

const conflictMessage = () => t('auth.cloudConflict');
const cacheWarningMessage = () => t('auth.cloudCacheWarning');

export function createEmptyWorkspace(name: string): AppData {
  return {
    version: 1,
    profile: {
      name: name.trim().slice(0, 160) || t('auth.workspaceName'),
      role: t('auth.workspaceDescription'),
      weeklyGoalMinutes: 600,
      focusMinutes: 25,
      theme: 'light',
      language: getLanguage(),
    },
    tasks: [],
    skills: [],
    entries: [],
    events: [],
  };
}

export function cloudCacheKey(userId: string): string {
  return `madar:cloud:${userId}`;
}

export function parseWorkspaceCache(text: string): WorkspaceCache {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid recovery cache');
  }
  const cache = value as Record<string, unknown>;
  if (
    cache.version !== 1 ||
    typeof cache.baseRevision !== 'number' ||
    !Number.isSafeInteger(cache.baseRevision) ||
    cache.baseRevision < 0 ||
    typeof cache.dirty !== 'boolean'
  ) {
    throw new Error('Invalid recovery cache');
  }
  return {
    version: 1,
    data: parseBackup(JSON.stringify(cache.data)),
    baseRevision: cache.baseRevision,
    dirty: cache.dirty,
  };
}

function validateRow(row: WorkspaceRow, userId: string): WorkspaceRow & { payload: AppData } {
  if (
    row.user_id !== userId ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.updated_at !== 'string' ||
    Number.isNaN(Date.parse(row.updated_at))
  ) {
    throw new WorkspaceError('error', t('auth.cloudResponseInvalid'));
  }
  try {
    return { ...row, payload: parseBackup(JSON.stringify(row.payload)) };
  } catch {
    throw new WorkspaceError('error', t('auth.cloudPayloadInvalid'));
  }
}

function friendlyError(error: unknown): WorkspaceError {
  return error instanceof WorkspaceError
    ? error
    : new WorkspaceError('offline', t('auth.cloudChangesRetained'));
}

/**
 * A single writer per mounted account. Saves use a server revision comparison,
 * so this browser can never silently replace a newer snapshot from another device.
 */
export class CloudWorkspaceController {
  private snapshot: WorkspaceSnapshot;
  private cache: WorkspaceCache | null = null;
  private revision = 0;
  private dirty = false;
  private editVersion = 0;
  private disposed = false;
  private started = false;
  private reading = false;
  private saving = false;
  private cacheWarning = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly options: {
      userId: string;
      name: string;
      backend: WorkspaceBackend;
      storage: RecoveryStorage;
      debounceMs?: number;
    },
  ) {
    try {
      const saved = options.storage.getItem(cloudCacheKey(options.userId));
      if (saved !== null) this.cache = parseWorkspaceCache(saved);
    } catch {
      // An unreadable cache is never mistaken for usable cloud data.
      this.cacheWarning = t('auth.cloudCacheUnreadable');
    }
    this.revision = this.cache?.baseRevision ?? 0;
    this.dirty = this.cache?.dirty ?? false;
    this.snapshot = {
      data: this.cache?.data ?? createEmptyWorkspace(options.name),
      ready: false,
      status: 'loading',
      error: this.cacheWarning,
      lastSaved: null,
    };
  }

  getSnapshot = (): WorkspaceSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<WorkspaceSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    if (this.disposed) return;
    const cache: WorkspaceCache = {
      version: 1,
      data: this.snapshot.data,
      baseRevision: this.revision,
      dirty: this.dirty,
    };
    try {
      this.options.storage.setItem(cloudCacheKey(this.options.userId), JSON.stringify(cache));
      this.cache = cache;
      this.cacheWarning = '';
    } catch {
      this.cacheWarning = cacheWarningMessage();
      this.publish({ error: cacheWarningMessage() });
    }
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    await this.readRemote();
  }

  /** Manual retry also reconciles pending recovery edits before replaying them. */
  async retry(): Promise<void> {
    if (this.disposed || this.reading || this.saving) return;
    if (this.snapshot.status === 'conflict') return;
    this.publish({ status: this.snapshot.ready ? 'saving' : 'loading', error: this.cacheWarning });
    await this.readRemote();
  }

  async refreshIfClean(): Promise<void> {
    if (
      this.disposed ||
      this.dirty ||
      this.reading ||
      this.saving ||
      !this.snapshot.ready ||
      this.snapshot.status === 'conflict'
    ) {
      return;
    }
    await this.readRemote();
  }

  private async readRemote(): Promise<void> {
    if (this.disposed || this.reading || this.saving) return;
    this.reading = true;
    try {
      const raw = await this.options.backend.load();
      if (this.disposed) return;
      const row = raw === null ? null : validateRow(raw, this.options.userId);
      const remoteRevision = row?.revision ?? 0;

      // Any pending local work must start from the same server revision.
      // A deleted server row is also treated as a conflict for a previously saved account.
      if ((this.dirty && remoteRevision !== this.revision) || (row === null && this.revision > 0)) {
        this.publish({ ready: true, status: 'conflict', error: conflictMessage() });
        return;
      }

      this.revision = remoteRevision;
      if (!this.dirty) {
        this.publish({
          data: row?.payload ?? createEmptyWorkspace(this.options.name),
          ready: true,
          status: 'synced',
          lastSaved: row?.updated_at ?? null,
          error: '',
        });
        this.persist();
        if (this.cacheWarning) this.publish({ status: 'error', error: this.cacheWarning });
      } else {
        this.publish({
          ready: true,
          status: 'saving',
          lastSaved: row?.updated_at ?? null,
          error: this.cacheWarning,
        });
      }
    } catch (error) {
      if (this.disposed) return;
      const failure = friendlyError(error);
      this.publish({
        ready: this.snapshot.ready || this.cache !== null,
        status: failure.kind,
        error: [failure.message, this.cacheWarning].filter(Boolean).join(' '),
      });
    } finally {
      this.reading = false;
      if (!this.disposed && this.dirty && this.snapshot.status === 'saving') this.scheduleSave();
    }
  }

  setData = (next: AppData | ((previous: AppData) => AppData)): void => {
    if (this.disposed || !this.snapshot.ready) return;
    const value = typeof next === 'function' ? next(this.snapshot.data) : next;
    if (Object.is(value, this.snapshot.data)) return;
    this.dirty = true;
    this.editVersion += 1;
    const conflict = this.snapshot.status === 'conflict';
    this.publish({
      data: value,
      status: conflict ? 'conflict' : 'saving',
      error: conflict ? conflictMessage() : this.cacheWarning,
    });
    this.persist();
    if (!conflict) this.scheduleSave();
  };

  private scheduleSave(delay = this.options.debounceMs ?? 600): void {
    if (this.disposed || this.snapshot.status === 'conflict') return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (
      this.disposed ||
      this.reading ||
      this.saving ||
      !this.dirty ||
      !this.snapshot.ready ||
      this.snapshot.status === 'conflict'
    ) {
      return;
    }
    const data = this.snapshot.data;
    const editVersion = this.editVersion;
    const expectedRevision = this.revision;
    this.saving = true;
    this.publish({ status: 'saving', error: this.cacheWarning });
    try {
      const saved = await this.options.backend.save(data, expectedRevision);
      if (this.disposed) return;
      this.acceptSave(saved, editVersion, expectedRevision);
    } catch (error) {
      if (this.disposed) return;
      const failure = friendlyError(error);
      this.publish({
        status: failure.kind,
        error:
          failure.kind === 'conflict'
            ? conflictMessage()
            : [failure.message, this.cacheWarning].filter(Boolean).join(' '),
      });
      this.persist();
    } finally {
      this.saving = false;
      if (!this.disposed && this.dirty && this.snapshot.status === 'saving') this.scheduleSave(0);
    }
  }

  private acceptSave(raw: WorkspaceRow, editVersion: number, expectedRevision: number): void {
    const saved = validateRow(raw, this.options.userId);
    if (saved.revision !== expectedRevision + 1) {
      throw new WorkspaceError('error', t('auth.cloudRevisionInvalid'));
    }
    this.revision = saved.revision;
    this.dirty = this.editVersion !== editVersion;
    this.publish({
      ...(this.dirty ? {} : { data: saved.payload }),
      status: this.dirty ? 'saving' : 'synced',
      lastSaved: saved.updated_at,
      error: '',
    });
    this.persist();
    if (this.cacheWarning) {
      this.publish({ status: this.dirty ? 'saving' : 'error', error: this.cacheWarning });
    }
  }

  async resolveConflict(strategy: 'reload' | 'overwrite'): Promise<void> {
    if (this.disposed || this.reading || this.saving) return;
    this.reading = true;
    const beforeRead = this.editVersion;
    try {
      const raw = await this.options.backend.load();
      if (this.disposed) return;
      const row = raw === null ? null : validateRow(raw, this.options.userId);
      if (strategy === 'reload') {
        if (this.editVersion !== beforeRead) {
          throw new WorkspaceError('conflict', t('auth.cloudEditsDuringLoad'));
        }
        this.revision = row?.revision ?? 0;
        this.dirty = false;
        this.publish({
          data: row?.payload ?? createEmptyWorkspace(this.options.name),
          ready: true,
          status: 'synced',
          lastSaved: row?.updated_at ?? null,
          error: '',
        });
        this.persist();
        if (this.cacheWarning) this.publish({ status: 'error', error: this.cacheWarning });
      } else {
        // This is a single explicit attempt, still protected against a concurrent device save.
        const expectedRevision = row?.revision ?? 0;
        const editVersion = this.editVersion;
        this.saving = true;
        this.publish({ status: 'saving', error: this.cacheWarning });
        const saved = await this.options.backend.save(this.snapshot.data, expectedRevision);
        if (this.disposed) return;
        this.acceptSave(saved, editVersion, expectedRevision);
      }
    } catch (error) {
      if (this.disposed) return;
      const failure = friendlyError(error);
      this.publish({
        status: failure.kind,
        error: failure.kind === 'conflict' ? conflictMessage() : failure.message,
      });
      throw failure;
    } finally {
      this.reading = false;
      this.saving = false;
      if (!this.disposed && this.dirty && this.snapshot.status === 'saving') this.scheduleSave(0);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}
