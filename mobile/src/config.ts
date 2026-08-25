import Constants from 'expo-constants';

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  const apiHost = extra?.apiUrl || process.env.EXPO_PUBLIC_API_HOST;
  if (apiHost && !apiHost.includes('localhost')) {
    return apiHost.replace(/\/$/, '');
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:4000`;
    }
  }
  return (apiHost || 'http://localhost:4000').replace(/\/$/, '');
}

/**
 * Host of the web operator console (the human-facing ERP UI).
 * Defaults to the same host as the API, on port 5173.
 * Override with EXPO_PUBLIC_WEB_PORT if you serve the operator app elsewhere.
 */
export const WEB_URL = resolveApiUrl().replace(/:\d+$/, `:${process.env.EXPO_PUBLIC_WEB_PORT || '5173'}`);

export const API_URL = resolveApiUrl();
export const API_BASE = `${API_URL}/api`;
