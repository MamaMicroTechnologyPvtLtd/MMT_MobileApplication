import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      setProfile(data.profile);
    } catch {
      // token invalid/expired
      await setToken(null);
      setUser(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } });
    await setToken(data.token);
    setUser(data.user);
    await loadMe();
  }, [loadMe]);

  const register = useCallback(async (payload) => {
    const data = await api('/auth/register', { method: 'POST', auth: false, body: payload });
    await setToken(data.token);
    setUser(data.user);
    await loadMe();
  }, [loadMe]);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, login, register, logout, refreshProfile: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
