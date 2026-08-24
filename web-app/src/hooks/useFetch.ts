import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Simple GET hook with automatic refetch when params change. */
export function useFetch<T = any>(url: string | null, params?: Record<string, any>): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const paramsKey = JSON.stringify(params || {});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) { setData(null); setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    api
      .get(url, { params: params ? JSON.parse(paramsKey) : undefined, signal: controller.signal })
      .then((res) => setData(res.data.data ?? res.data))
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.message || err.message || 'Request failed');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export function useDebounce<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Reads browser GPS for "capture GPS automatically" flows on web. */
export function getBrowserLocation(timeout = 8000): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout }
    );
  });
}
