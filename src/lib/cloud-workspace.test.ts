import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CloudWorkspaceController,
  cloudCacheKey,
  createEmptyWorkspace,
  createWorkspaceBackend,
  parseWorkspaceCache,
  WorkspaceError,
  type RecoveryStorage,
  type WorkspaceBackend,
  type WorkspaceCache,
  type WorkspaceRow,
} from './cloud-workspace';
import { parseBackup, STORAGE_KEY } from './storage';
import type { AppData } from './types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const userId = 'account-one';
const baseData = () => createEmptyWorkspace('مصطفى');
const changedData = (name: string) => ({ ...baseData(), profile: { ...baseData().profile, name } });

function row(revision = 1, payload = baseData(), owner = userId): WorkspaceRow {
  return {
    user_id: owner,
    payload,
    revision,
    updated_at: new Date().toISOString(),
  };
}

function storage() {
  const records = new Map<string, string>();
  return {
    records,
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => records.set(key, value)),
  };
}

function storeCache(store: RecoveryStorage, data: AppData, revision: number, dirty: boolean) {
  const cache: WorkspaceCache = { version: 1, data, baseRevision: revision, dirty };
  store.setItem(cloudCacheKey(userId), JSON.stringify(cache));
}

function backend(initial: WorkspaceRow | null = null) {
  let current = initial;
  const api = {
    load: vi.fn(async () => current),
    save: vi.fn(async (data: AppData, expectedRevision: number) => {
      if ((current?.revision ?? 0) !== expectedRevision) {
        throw new WorkspaceError('conflict', 'workspace_conflict');
      }
      current = row(expectedRevision + 1, data);
      return current;
    }),
    setRemote(value: WorkspaceRow | null) {
      current = value;
    },
  };
  return api;
}

function controller(api: WorkspaceBackend, store: RecoveryStorage = storage()) {
  return new CloudWorkspaceController({ userId, name: 'مصطفى', backend: api, storage: store });
}

async function flush() {
  await vi.advanceTimersByTimeAsync(600);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('private workspace recovery', () => {
  it('starts a real account with valid empty data, without demo activities', () => {
    const data = createEmptyWorkspace('  اسم جديد  ');
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    expect(data.profile.name).toBe('اسم جديد');
    expect([data.tasks, data.skills, data.entries, data.events]).toEqual([[], [], [], []]);
    expect(createEmptyWorkspace(' ').profile.name).toBe('مساحتي');
  });

  it('never reads anonymous storage or another account’s cache', async () => {
    const store = storage();
    store.records.set(STORAGE_KEY, JSON.stringify(changedData('بيانات المتصفح')));
    store.records.set(
      cloudCacheKey('account-two'),
      JSON.stringify({
        version: 1,
        data: changedData('حساب آخر'),
        baseRevision: 0,
        dirty: true,
      }),
    );
    const api = backend();
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot().data.profile.name).toBe('مصطفى');
    expect(store.getItem).toHaveBeenCalledExactlyOnceWith(cloudCacheKey(userId));
    await flush();
    expect(api.save).not.toHaveBeenCalled();
    state.dispose();
  });

  it.each([
    '{}',
    '{broken',
    JSON.stringify({ version: 1, data: baseData(), baseRevision: -1, dirty: false }),
    JSON.stringify({ version: 1, data: baseData(), baseRevision: 1.5, dirty: false }),
    JSON.stringify({ version: 1, data: baseData(), baseRevision: 1, dirty: 'true' }),
    JSON.stringify({ version: 1, data: {}, baseRevision: 1, dirty: true }),
  ])('rejects malformed recovery metadata or data: %s', (text) => {
    expect(() => parseWorkspaceCache(text)).toThrow();
  });

  it('cannot create or overwrite cloud data after an initial read failure without a cache', async () => {
    const store = storage();
    const api = backend();
    api.load.mockRejectedValue(new Error('network unavailable'));
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot()).toMatchObject({ ready: false, status: 'offline' });
    state.setData(changedData('تعديل غير متاح'));
    await flush();
    expect(api.save).not.toHaveBeenCalled();
    expect(store.setItem).not.toHaveBeenCalled();
    state.dispose();
  });

  it('uses only a validated account cache when offline and preserves pending edits', async () => {
    const store = storage();
    storeCache(store, changedData('تعديل محفوظ'), 3, true);
    const api = backend();
    api.load.mockRejectedValue(new Error('network unavailable'));
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot()).toMatchObject({ ready: true, status: 'offline' });
    expect(state.getSnapshot().data.profile.name).toBe('تعديل محفوظ');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!)).toMatchObject({
      baseRevision: 3,
      dirty: true,
    });
    state.dispose();
  });

  it('keeps corrupt cache text untouched if the cloud also fails', async () => {
    const store = storage();
    store.records.set(cloudCacheKey(userId), '{broken');
    const api = backend();
    api.load.mockRejectedValue(new Error('offline'));
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot().ready).toBe(false);
    expect(store.records.get(cloudCacheKey(userId))).toBe('{broken');
    state.dispose();
  });

  it('replays a dirty cache only when its base revision still matches the cloud', async () => {
    const store = storage();
    storeCache(store, changedData('محلي أحدث'), 4, true);
    const api = backend(row(4));
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot().status).toBe('saving');
    await flush();
    expect(api.save).toHaveBeenCalledExactlyOnceWith(changedData('محلي أحدث'), 4);
    expect(state.getSnapshot().status).toBe('synced');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!)).toMatchObject({
      baseRevision: 5,
      dirty: false,
    });
    state.dispose();
  });

  it('does not replay a dirty cache over newer cloud data', async () => {
    const store = storage();
    storeCache(store, changedData('محلي'), 4, true);
    const api = backend(row(5, changedData('جهاز آخر')));
    const state = controller(api, store);
    await state.start();
    await flush();
    expect(state.getSnapshot()).toMatchObject({ ready: true, status: 'conflict' });
    expect(state.getSnapshot().data.profile.name).toBe('محلي');
    expect(api.save).not.toHaveBeenCalled();
    state.dispose();
  });
});

describe('account-bound Supabase adapter', () => {
  it('sends the mounted account ID in save requests even if the client session changes', async () => {
    const rpc = vi.fn(async () => ({ data: [row(2)], error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    const api = createWorkspaceBackend(client, userId);
    await api.save(baseData(), 1);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_workspace', {
      p_payload: baseData(),
      p_expected_revision: 1,
      p_user_id: userId,
    });
  });

  it('loads only the mounted account row', async () => {
    const maybeSingle = vi.fn(async () => ({ data: row(), error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient;
    await createWorkspaceBackend(client, userId).load();
    expect(from).toHaveBeenCalledExactlyOnceWith('user_workspaces');
    expect(eq).toHaveBeenCalledExactlyOnceWith('user_id', userId);
  });

  it('translates revision conflicts without claiming that a save succeeded', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '40001', message: 'workspace_conflict' },
      })),
    } as unknown as SupabaseClient;
    await expect(createWorkspaceBackend(client, userId).save(baseData(), 1)).rejects.toMatchObject({
      kind: 'conflict',
    });
  });
});

describe('serialized cloud saves', () => {
  it('debounces rapid changes and only sends the latest snapshot', async () => {
    const api = backend();
    const state = controller(api);
    await state.start();
    state.setData(changedData('الأول'));
    await vi.advanceTimersByTimeAsync(400);
    state.setData((previous) => ({
      ...previous,
      profile: { ...previous.profile, name: 'الثاني' },
    }));
    await vi.advanceTimersByTimeAsync(599);
    expect(api.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.save).toHaveBeenCalledExactlyOnceWith(changedData('الثاني'), 0);
    expect(state.getSnapshot().status).toBe('synced');
    state.dispose();
  });

  it('retains edits made during an in-flight save and sends them using its new revision', async () => {
    const firstSave = deferred<WorkspaceRow>();
    const api = backend();
    api.save.mockImplementationOnce(() => firstSave.promise);
    const store = storage();
    const state = controller(api, store);
    await state.start();
    state.setData(changedData('الأول'));
    await flush();
    expect(api.save).toHaveBeenCalledTimes(1);
    state.setData(changedData('الثاني'));
    await flush();
    expect(api.save).toHaveBeenCalledTimes(1);
    const savedFirst = row(1, changedData('الأول'));
    api.setRemote(savedFirst);
    firstSave.resolve(savedFirst);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenNthCalledWith(2, changedData('الثاني'), 1);
    expect(state.getSnapshot().data.profile.name).toBe('الثاني');
    expect(state.getSnapshot().status).toBe('synced');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!).baseRevision).toBe(2);
    state.dispose();
  });

  it('leaves a failed save dirty and retries only after reconciling the current remote revision', async () => {
    const api = backend();
    api.save.mockRejectedValueOnce(new Error('offline'));
    const store = storage();
    const state = controller(api, store);
    await state.start();
    state.setData(changedData('محفوظ محلياً'));
    await flush();
    expect(state.getSnapshot().status).toBe('offline');
    expect(state.getSnapshot().lastSaved).toBeNull();
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!).dirty).toBe(true);
    await state.retry();
    await flush();
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(state.getSnapshot().status).toBe('synced');
    state.dispose();
  });

  it('stops all automatic saves after the server reports a concurrent modification', async () => {
    const api = backend(row(1));
    const state = controller(api);
    await state.start();
    api.setRemote(row(2, changedData('من الهاتف')));
    state.setData(changedData('من الكمبيوتر'));
    await flush();
    expect(state.getSnapshot().status).toBe('conflict');
    state.setData(changedData('تعديل إضافي'));
    await state.retry();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(state.getSnapshot().data.profile.name).toBe('تعديل إضافي');
    state.dispose();
  });

  it('refreshes clean workspaces from another device without issuing a save', async () => {
    const api = backend(row(1));
    const state = controller(api);
    await state.start();
    api.setRemote(row(2, changedData('من الهاتف')));
    await state.refreshIfClean();
    expect(state.getSnapshot().data.profile.name).toBe('من الهاتف');
    expect(state.getSnapshot().status).toBe('synced');
    expect(api.save).not.toHaveBeenCalled();
    state.dispose();
  });

  it('never replaces an edit made while a background read was running', async () => {
    const api = backend(row(1));
    const state = controller(api);
    await state.start();
    const loading = deferred<WorkspaceRow>();
    api.load.mockImplementationOnce(() => loading.promise);
    const refresh = state.refreshIfClean();
    state.setData(changedData('تعديل أثناء التحميل'));
    loading.resolve(row(2, changedData('جهاز آخر')));
    await refresh;
    await flush();
    expect(state.getSnapshot().data.profile.name).toBe('تعديل أثناء التحميل');
    expect(state.getSnapshot().status).toBe('conflict');
    expect(api.save).not.toHaveBeenCalled();
    state.dispose();
  });

  it('warns about local cache quota failure while still saving successfully to the cloud', async () => {
    const store = storage();
    store.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const api = backend();
    const state = controller(api, store);
    await state.start();
    state.setData(changedData('ينحفظ سحابياً'));
    await flush();
    expect(api.save).toHaveBeenCalledExactlyOnceWith(changedData('ينحفظ سحابياً'), 0);
    expect(state.getSnapshot().lastSaved).not.toBeNull();
    expect(state.getSnapshot().status).toBe('error');
    expect(state.getSnapshot().error).toContain('نسخة الاسترجاع');
    state.dispose();
  });
});

describe('explicit conflict resolution and lifecycle', () => {
  it('reload discards local pending changes only after the user explicitly chooses it', async () => {
    const store = storage();
    storeCache(store, changedData('محلي'), 1, true);
    const api = backend(row(2, changedData('سحابي')));
    const state = controller(api, store);
    await state.start();
    await state.resolveConflict('reload');
    expect(state.getSnapshot().data.profile.name).toBe('سحابي');
    expect(state.getSnapshot().status).toBe('synced');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!)).toMatchObject({
      dirty: false,
      baseRevision: 2,
    });
    expect(api.save).not.toHaveBeenCalled();
    state.dispose();
  });

  it('overwrite obtains the latest revision and makes one protected save attempt', async () => {
    const store = storage();
    storeCache(store, changedData('محلي'), 1, true);
    const api = backend(row(2));
    const state = controller(api, store);
    await state.start();
    api.setRemote(row(3, changedData('سحابي أحدث')));
    await state.resolveConflict('overwrite');
    expect(api.save).toHaveBeenCalledExactlyOnceWith(changedData('محلي'), 3);
    expect(state.getSnapshot().status).toBe('synced');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!).baseRevision).toBe(4);
    state.dispose();
  });

  it('an overwrite race requires another user decision instead of silently retrying', async () => {
    const store = storage();
    storeCache(store, changedData('محلي'), 1, true);
    const api = backend(row(2));
    const state = controller(api, store);
    await state.start();
    api.save.mockRejectedValueOnce(new WorkspaceError('conflict', 'workspace_conflict'));
    await expect(state.resolveConflict('overwrite')).rejects.toThrow('workspace_conflict');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(state.getSnapshot().status).toBe('conflict');
    expect(state.getSnapshot().data.profile.name).toBe('محلي');
    state.dispose();
  });

  it('a failed conflict-resolution read exposes an error and leaves cached edits intact', async () => {
    const store = storage();
    storeCache(store, changedData('محلي'), 1, true);
    const api = backend(row(2));
    const state = controller(api, store);
    await state.start();
    api.load.mockRejectedValueOnce(new Error('offline'));
    await expect(state.resolveConflict('reload')).rejects.toThrow();
    expect(state.getSnapshot().status).toBe('offline');
    expect(state.getSnapshot().data.profile.name).toBe('محلي');
    expect(parseWorkspaceCache(store.records.get(cloudCacheKey(userId))!).dirty).toBe(true);
    state.dispose();
  });

  it('rejects cloud rows belonging to another account', async () => {
    const api = backend(row(1, baseData(), 'account-two'));
    const store = storage();
    const state = controller(api, store);
    await state.start();
    expect(state.getSnapshot()).toMatchObject({ ready: false, status: 'error' });
    expect(store.setItem).not.toHaveBeenCalled();
    state.dispose();
  });

  it('does not write caches or schedule saves after disposal during an initial read', async () => {
    const loading = deferred<WorkspaceRow>();
    const api = backend();
    api.load.mockImplementationOnce(() => loading.promise);
    const store = storage();
    const state = controller(api, store);
    const starting = state.start();
    state.dispose();
    loading.resolve(row());
    await starting;
    await flush();
    expect(store.setItem).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
});
