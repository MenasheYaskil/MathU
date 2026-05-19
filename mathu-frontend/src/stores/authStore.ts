import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  username: string | null;
  role: 'TEACHER' | 'STUDENT' | null;
  setAuth: (token: string, username: string, role: 'TEACHER' | 'STUDENT') => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      role: null,
      setAuth: (token, username, role) => {
        localStorage.setItem('mathu_token', token);
        set({ token, username, role });
      },
      clearAuth: () => {
        localStorage.removeItem('mathu_token');
        set({ token: null, username: null, role: null });
      },
    }),
    { name: 'mathu-auth' },
  ),
);
