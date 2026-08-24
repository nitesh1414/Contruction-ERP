import Constants from 'expo-constants';

/**
 * API base URL resolution order:
 *  1. EXPO_PUBLIC_API_URL env var (works with `expo start`)
 *  2. app.json -> expo.extra.apiUrl
 *  3. Expo host IP (when the backend runs on the same machine as the dev server,
 *     this lets physical devices reach it automatically)
 */
function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  if (extra?.apiUrl && !extra.apiUrl.includes('localhost')) {
    return extra.apiUrl.replace(/\/$/, '');
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:4000`;
    }
  }

  return extra?.apiUrl?.replace(/\/$/, '') || 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();
export const API_BASE = `${API_URL}/api`;
