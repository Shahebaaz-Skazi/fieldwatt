import useAuthStore from '../store/authStore';

const API_BASE_URL = 'https://fieldwatt-backend.onrender.com'; // ponytail: adjust during deployment

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
