import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const TOKEN_KEY = '@cerp/tokens';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let tokens: Tokens | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

export async function loadTokens(): Promise<Tokens | null> {
  if (tokens) return tokens;
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    tokens = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    tokens = null;
  }
  return tokens;
}

export async function saveTokens(next: Tokens | null): Promise<void> {
  tokens = next;
  if (next) {
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function refreshAccessToken(): Promise<boolean> {
  const current = await loadTokens();
  if (!current?.refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    const json = await res.json();
    if (!res.ok || !json?.data?.accessToken) return false;
    await saveTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  params?: Record<string, unknown>;
  retry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, params, retry = true } = options;
  const current = await loadTokens();

  const headers: Record<string, string> = {};
  if (current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`;
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your network connection.');
  }

  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, { ...options, retry: false });
    await saveTokens(null);
    onSessionExpired?.();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  let json: any = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message = json?.message || json?.error || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  postForm: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  putForm: <T>(path: string, formData: FormData) => request<T>(path, { method: 'PUT', formData }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Builds a React-Native FormData file part from a local file URI. */
export function filePart(uri: string, name?: string) {
  const filename = name || uri.split('/').pop() || 'photo.jpg';
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'jpg';
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
  // React Native FormData accepts {uri, name, type} objects
  return { uri, name: filename, type: mime } as unknown as Blob;
}

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
