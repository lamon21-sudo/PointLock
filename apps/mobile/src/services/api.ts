import axios from 'axios';
import Constants from 'expo-constants';

// Get API URL from environment or use default
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api/v1';

// For development on physical device, you may need to use your machine's IP
// const API_URL = 'http://192.168.1.XXX:3000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token
api.interceptors.request.use(
  (config) => {
    // TODO: Add auth token from secure storage
    // const token = await SecureStore.getItemAsync('accessToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 (token expired) - TODO: implement refresh token flow
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // TODO: Refresh token and retry request
    }

    return Promise.reject(error);
  }
);

export default api;
