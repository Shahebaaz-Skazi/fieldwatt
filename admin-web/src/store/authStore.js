import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('admin_user')) || null,
  token: localStorage.getItem('admin_token') || null,
  activePage: 'dashboard',
  
  login: (user, token) => {
    localStorage.setItem('admin_user', JSON.stringify(user));
    localStorage.setItem('admin_token', token);
    set({ user, token });
  },
  
  logout: () => {
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_token');
    set({ user: null, token: null, activePage: 'dashboard' });
  },
  
  setActivePage: (activePage) => set({ activePage }),
}));

export default useAuthStore;
