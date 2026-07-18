import useAuthStore from '../store/authStore';

import Constants from 'expo-constants';

const getApiBaseUrl = (): string => {
  const isDevMode = typeof __DEV__ !== 'undefined' && __DEV__;
  // Running in Expo Go local dev
  if (isDevMode && Constants.expoConfig?.hostUri) {
    const host = Constants.expoConfig.hostUri.split(':')[0];
    return `http://${host}:3000`;
  }
  // Running on web browser (localhost or Vercel)
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location?.hostname;
    if (hostname === 'localhost') return 'http://localhost:3000';
    return 'https://fieldwatt-backend.onrender.com';
  }
  // Fallback for production native build
  return 'https://fieldwatt-backend.onrender.com';
};

export const API_BASE_URL = getApiBaseUrl();

export const apiRequest = async (endpoint: string, options: any = {}) => {
  const token = useAuthStore.getState().token;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { message: text };
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }
    throw new Error(data.error || data.message || 'Network request failed.');
  }

  return data;
};

export default {
  get: (endpoint: string, options?: any) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint: string, body: any, options?: any) => apiRequest(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  API_BASE_URL,
};
