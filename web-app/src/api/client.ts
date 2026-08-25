import axios, { AxiosError } from 'axios';

/**
 * API client. Uses the Vite dev-server proxy: browser calls same-origin /api/*,
 * Vite proxies to the backend (works in dev AND preview — no hardcoded hosts).
 * If VITE_API_URL is set (production split hosting) it is used as baseURL.
 */
const baseURL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL, timeout: 60000 });

const TOKEN_KEY = 'cerp.accessToken';
const REFRESH_KEY = 'cerp.refreshToken';

export const tokenStore = {
  get access() { return localStorage.getItem(TOKEN_KEY); },
  get refresh() { return localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

api.interceptors.request.use((cfg) => {
  const t = tokenStore.access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original?._retried && tokenStore.refresh) {
      original._retried = true;
      refreshing = refreshing || (async () => {
        try {
          const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: tokenStore.refresh });
          const { accessToken, refreshToken } = res.data.data;
          tokenStore.set(accessToken, refreshToken);
          return accessToken as string;
        } catch {
          tokenStore.clear();
          return null;
        } finally {
          setTimeout(() => { refreshing = null; }, 1000);
        }
      })();
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Extract a friendly error message from an axios error. */
export function errMsg(e: unknown): string {
  const err = e as AxiosError<any>;
  return err?.response?.data?.message || err?.message || 'Something went wrong';
}

/** Fetch a protected file (module files) as an object URL for preview/download. */
export async function fileObjectUrl(fileId: number): Promise<string> {
  const res = await api.get(`/files/${fileId}`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}

/** Build a file URL helper: we fetch blobs to preserve Authorization for previews. */
export async function downloadFile(fileId: number, filename?: string) {
  const res = await api.get(`/files/${fileId}?download=1`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `file-${fileId}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Helper to download exports (CSV) through axios so the token is attached. */
export async function downloadExport(path: string, fallbackName: string) {
  const res = await api.get(path, { responseType: 'blob' });
  const dispo = String(res.headers['content-disposition'] || '');
  const m = /filename="?([^";]+)"?/.exec(dispo);
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = m?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
