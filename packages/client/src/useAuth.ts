import { useCallback, useEffect, useState } from 'react';
import type { AuthResponse, CheckoutRes, PublicUser } from '@skak/shared';
import { apiGet, apiPost } from './api.js';

const TOKEN_KEY = 'skak.token';

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  country: string;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<PublicUser | null>(null);

  const store = useCallback((t: string | null) => {
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  // Validate the stored token on load.
  useEffect(() => {
    if (!token) return;
    apiGet<{ ok: boolean; user?: PublicUser }>('/api/me', token).then((res) => {
      if (res.ok && res.user) setUser(res.user);
      else store(null);
    });
  }, [token, store]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await apiGet<{ ok: boolean; user?: PublicUser }>('/api/me', token);
    if (res.ok && res.user) setUser(res.user);
  }, [token]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await apiPost<AuthResponse>('/api/login', { username, password });
      if (res.ok && res.token && res.user) {
        store(res.token);
        setUser(res.user);
      }
      return { ok: res.ok, error: res.error };
    },
    [store],
  );

  const signup = useCallback(
    async (input: SignupInput): Promise<{ ok: boolean; error?: string }> => {
      const res = await apiPost<AuthResponse>('/api/signup', input);
      if (res.ok && res.token && res.user) {
        store(res.token);
        setUser(res.user);
      }
      return { ok: res.ok, error: res.error };
    },
    [store],
  );

  const logout = useCallback(() => {
    store(null);
    setUser(null);
  }, [store]);

  const setTheme = useCallback(
    async (theme: string | null): Promise<{ ok: boolean; error?: string }> => {
      if (!token) return { ok: false, error: 'Sign in first.' };
      const res = await apiPost<{ ok: boolean; user?: PublicUser; error?: string }>(
        '/api/me/theme',
        { theme },
        token,
      );
      if (res.ok && res.user) setUser(res.user);
      return { ok: res.ok, error: res.error };
    },
    [token],
  );

  /** Open Stripe Checkout in the current tab. Returns {ok:false,error} if it can't. */
  const startCheckout = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!token) return { ok: false, error: 'Sign in first.' };
    const res = await apiPost<CheckoutRes>('/api/billing/checkout', {}, token);
    if (res.ok && res.url) {
      window.location.href = res.url;
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }, [token]);

  const openPortal = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!token) return { ok: false, error: 'Sign in first.' };
    const res = await apiPost<CheckoutRes>('/api/billing/portal', {}, token);
    if (res.ok && res.url) {
      window.location.href = res.url;
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }, [token]);

  return { token, user, login, signup, logout, refresh, setTheme, startCheckout, openPortal };
}
