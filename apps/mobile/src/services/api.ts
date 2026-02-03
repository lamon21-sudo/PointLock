import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { setupAuthInterceptors } from './auth-interceptor';

// =====================================================
// API URL Configuration
// =====================================================
// Get API URL from environment or use default
// For physical devices/simulators, localhost won't work - use your machine's IP
//
// TROUBLESHOOTING CONNECTION ISSUES:
// 1. Check if backend is running: curl http://localhost:3000/api/v1/health
// 2. For Android emulator: Uses 10.0.2.2 to reach host localhost
// 3. For iOS simulator: Uses localhost (127.0.0.1)
// 4. For physical devices: Set LOCAL_DEV_IP in app.config.js to your machine's IP
//    - Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
//    - Example: 192.168.1.175
// 5. Ensure firewall allows connections on port 3000

const getApiUrl = (): string => {
  // Check if explicitly set in Expo config
  if (Constants.expoConfig?.extra?.apiUrl) {
    return Constants.expoConfig.extra.apiUrl;
  }

  // Android emulator uses 10.0.2.2 to reach host machine's localhost
  // iOS simulator can use localhost
  // Physical devices need the actual IP address
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Android emulator special IP for host localhost
      return 'http://10.0.2.2:3000/api/v1';
    }
    // For iOS simulator, localhost works
    // For physical devices, you'll need to set API_URL in app.config.js
    // or replace this with your machine's IP: 'http://192.168.X.X:3000/api/v1'
    return 'http://localhost:3000/api/v1';
  }

  // Production URL
  return 'https://api.pickrivals.com/api/v1';
};

const API_URL = getApiUrl();

// =====================================================
// Startup Logging - Critical for Debugging
// =====================================================
console.log('╔════════════════════════════════════════════════════╗');
console.log('║          PICK RIVALS API CONFIGURATION             ║');
console.log('╚════════════════════════════════════════════════════╝');
console.log('📡 API Base URL:', API_URL);
console.log('🔧 Environment:', __DEV__ ? 'DEVELOPMENT' : 'PRODUCTION');
console.log('📱 Platform:', Platform.OS);
console.log('⏱️  Timeout:', '30000ms (30 seconds)');
console.log('');

if (__DEV__) {
  if (API_URL.includes('localhost') || API_URL.includes('127.0.0.1')) {
    console.warn('⚠️  WARNING: API URL uses localhost!');
    console.warn('   This will NOT work on physical devices.');
    console.warn('   Update LOCAL_DEV_IP in app.config.js to your machine\'s LAN IP.');
    console.warn('   Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)');
    console.warn('');
  }

  if (API_URL.includes('10.0.2.2') && Platform.OS === 'ios') {
    console.warn('⚠️  WARNING: Using Android emulator IP (10.0.2.2) on iOS!');
    console.warn('   This will likely fail. Set apiUrl in app.config.js');
    console.warn('');
  }
}

// =====================================================
// Axios Instance
// =====================================================

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // Increased to 30s to handle slower connections
  headers: {
    'Content-Type': 'application/json',
  },
});

// =====================================================
// Request Interceptor - Debug Logging
// =====================================================
// Logs every outgoing request to help debug connection issues

api.interceptors.request.use(
  (config) => {
    // Construct full URL for debugging
    const fullUrl = `${config.baseURL}${config.url}`;
    console.log('🌐 API Request:', config.method?.toUpperCase(), fullUrl);

    if (__DEV__) {
      console.log('  Headers:', config.headers);
      if (config.data) {
        console.log('  Body:', JSON.stringify(config.data).substring(0, 100));
      }
    }

    return config;
  },
  (error) => {
    console.warn('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// =====================================================
// Response Interceptor - Error Logging (with spam prevention)
// =====================================================
// Logs response errors with detailed debugging info
// Prevents console spam by throttling duplicate errors

// Track recent errors to prevent spam
const recentErrors = new Map<string, number>();
const ERROR_THROTTLE_MS = 5000; // Don't log same error more than once per 5 seconds

function shouldLogError(errorKey: string): boolean {
  const now = Date.now();
  const lastLogged = recentErrors.get(errorKey);

  if (lastLogged && now - lastLogged < ERROR_THROTTLE_MS) {
    return false; // Throttle this error
  }

  recentErrors.set(errorKey, now);

  // Clean up old entries periodically
  if (recentErrors.size > 50) {
    for (const [key, time] of recentErrors) {
      if (now - time > ERROR_THROTTLE_MS * 2) {
        recentErrors.delete(key);
      }
    }
  }

  return true;
}

api.interceptors.response.use(
  (response) => {
    // Log successful responses in dev
    if (__DEV__) {
      console.log('✅ API Response:', response.config.method?.toUpperCase(), response.config.url, '- Status:', response.status);
    }
    return response;
  },
  (error) => {
    // Skip logging for 401 errors - these are handled by the auth interceptor
    // which will attempt token refresh and handle the error appropriately
    if (error.response?.status === 401) {
      return Promise.reject(error);
    }

    // Create a unique key for this error type
    const errorKey = `${error.config?.url || 'unknown'}-${error.response?.status || error.code || 'error'}`;

    // Only log if not recently logged (prevents console spam)
    if (shouldLogError(errorKey)) {
      console.warn('╔════════════════════════════════════════════════════╗');
      console.warn('║                 API REQUEST FAILED                 ║');
      console.warn('╚════════════════════════════════════════════════════╝');

      if (error.code === 'ECONNABORTED') {
        console.warn('❌ Error Type: TIMEOUT (30 seconds exceeded)');
        console.warn('💡 This usually means:');
        console.warn('   1. The backend is not running');
        console.warn('   2. The IP address is wrong (check app.config.js)');
        console.warn('   3. Your device is not on the same Wi-Fi network');
        console.warn('   4. Firewall is blocking port 3000');
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.warn('❌ Error Type: NETWORK ERROR');
        console.warn('💡 Cannot reach the server. Check:');
        console.warn('   1. Backend is running: curl http://localhost:3000/api/v1/health');
        console.warn('   2. You\'re using the correct IP in app.config.js');
        console.warn('   3. Device and computer are on the same Wi-Fi');
      } else if (error.response) {
        // Server responded with error status
        console.warn('📍 URL:', error.config?.baseURL + error.config?.url);
        console.warn('📦 Response:', JSON.stringify(error.response.data).substring(0, 200));

        // Extra context for 500 errors
        if (error.response.status >= 500) {
          console.warn('❌ Error Type: HTTP', error.response.status);
          console.warn('💡 This is a SERVER error. The backend crashed while processing this request.');
          console.warn('   Check the backend console/logs for the actual error stack trace.');
        } else {
          console.warn('❌ Error Type: HTTP', error.response.status);
        }
      } else {
        console.warn('❌ Error Type:', error.code || 'UNKNOWN');
        console.warn('📝 Message:', error.message);
      }

      console.warn('🔧 Config URL:', error.config?.baseURL + error.config?.url);
      console.warn('');
    }

    return Promise.reject(error);
  }
);

// =====================================================
// Setup Auth Interceptors
// =====================================================
// Configures request/response interceptors for token management
// - Request: Attaches access token from Zustand store
// - Response: Handles 401 with mutex-protected token refresh

setupAuthInterceptors(api);

export default api;
