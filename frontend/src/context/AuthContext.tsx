'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, clearToken } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'CITIZEN' | 'ADMIN';
  accountType: 'STANDARD' | 'CHILD';
  profileComplete: boolean;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
  createdAt: string;
  adminApproved?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  role: 'CITIZEN' | 'ADMIN';
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/api/users/me');
      setUser(data.user);
    } catch {
      clearToken();
      setTokenState(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('zg_token');
    if (stored) {
      setTokenState(stored);
      fetchMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  };

  const register = async (formData: RegisterData) => {
    const data = await api.post<{ token: string; user: User }>('/api/auth/register', formData);
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  };

  const logout = () => {
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
