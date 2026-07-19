import { create } from 'zustand';
import { setStoredAuth, clearStoredAuth } from '../db/sqlite';

interface User {
  id: string;
  name: string;
  phone: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  login: (user, token) => {
    // Persist to SQLite meta table automatically on every login
    setStoredAuth(user, token).catch(e => console.warn('Failed to persist auth:', e));
    set({ user, token });
  },
  logout: () => {
    // Clear from SQLite meta table automatically on every logout
    clearStoredAuth().catch(e => console.warn('Failed to clear auth:', e));
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
