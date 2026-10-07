import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { readAccountAccess } from '../lib/account-access';
import type { AccountAccess } from '../lib/account-access';
import { supabase } from '../lib/supabase';

interface AccessState {
  userId: string | null;
  access: AccountAccess | null;
  error: string;
  loading: boolean;
}

export function useAccountAccess(session: Session | null) {
  const userId = session?.user.id ?? null;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [state, setState] = useState<AccessState>({
    userId: null,
    access: null,
    error: '',
    loading: false,
  });

  const refreshAccountAccess = useCallback(async () => {
    const current = sessionRef.current;
    if (!supabase || !current || current.user.id !== userId) return;
    const epoch = ++generation.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setState((previous) => ({
      userId,
      access: previous.userId === userId ? previous.access : null,
      error: '',
      loading: previous.userId !== userId || !previous.access,
    }));
    try {
      const access = await readAccountAccess(supabase, current, controller.signal);
      if (epoch !== generation.current || sessionRef.current?.user.id !== userId) return;
      setState({ userId, access, error: '', loading: false });
    } catch (cause) {
      if (epoch !== generation.current || sessionRef.current?.user.id !== userId) return;
      setState({
        userId,
        access: null,
        error:
          cause instanceof Error ? cause.message : 'تعذّر التحقق من حالة الحساب. أعد المحاولة.',
        loading: false,
      });
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    activeRequest.current?.abort();
    if (!userId) {
      setState({ userId: null, access: null, error: '', loading: false });
      return;
    }
    void refreshAccountAccess();
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void refreshAccountAccess();
    };
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current += 1;
      activeRequest.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, refreshAccountAccess]);

  return {
    accountAccess: state.userId === userId ? state.access : null,
    accessLoading: !!userId && (state.userId !== userId || state.loading),
    accessError: state.userId === userId ? state.error : '',
    refreshAccountAccess,
  };
}
