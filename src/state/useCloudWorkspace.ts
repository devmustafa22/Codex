import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  CloudWorkspaceController,
  createEmptyWorkspace,
  createWorkspaceBackend,
  WorkspaceError,
  type WorkspaceSnapshot,
} from '../lib/cloud-workspace';
import type { AppData } from '../lib/types';

function createBackend(userId: string) {
  const client = supabase;
  if (!client) {
    throw new WorkspaceError('error', 'إعداد الاتصال بـ Supabase غير مكتمل.');
  }
  return createWorkspaceBackend(client, userId);
}

/** Account providers are keyed by user ID, which also isolates their recovery cache. */
export function useCloudWorkspace({ userId, name }: { userId: string; name: string }) {
  const controller = useRef<CloudWorkspaceController | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(() => ({
    data: createEmptyWorkspace(name),
    ready: false,
    status: 'loading',
    error: '',
    lastSaved: null,
  }));

  useEffect(() => {
    let current: CloudWorkspaceController;
    try {
      current = new CloudWorkspaceController({
        userId,
        name,
        backend: createBackend(userId),
        storage: {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
        },
      });
    } catch {
      setSnapshot((previous) => ({
        ...previous,
        ready: false,
        status: 'error',
        error: 'إعداد الاتصال بالسحابة غير مكتمل. تحقّق من متغيرات البيئة.',
      }));
      return;
    }
    controller.current = current;
    const unsubscribe = current.subscribe(() => setSnapshot(current.getSnapshot()));
    setSnapshot(current.getSnapshot());
    void current.start();
    const refresh = () => void current.refreshIfClean();
    const reconnect = () => void current.retry();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', reconnect);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      unsubscribe();
      current.dispose();
      if (controller.current === current) controller.current = null;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', reconnect);
      window.clearInterval(interval);
    };
    // A display-name edit belongs to the workspace; it must not restart its save queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const setData = useCallback((next: AppData | ((previous: AppData) => AppData)) => {
    controller.current?.setData(next);
  }, []);
  const retry = useCallback(() => {
    void controller.current?.retry();
  }, []);
  const resolveConflict = useCallback(async (strategy: 'reload' | 'overwrite') => {
    await controller.current?.resolveConflict(strategy);
  }, []);

  return { ...snapshot, setData, retry, resolveConflict };
}
