import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export interface GpsFix {
  latitude: number;
  longitude: number;
  captured_at: string;
}

export interface GpsState {
  fix: GpsFix | null;
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'error';
  error: string | null;
  capture: () => Promise<GpsFix | null>;
}

/** Requests foreground permission and grabs a fresh GPS fix. */
export function useGps(): GpsState {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [status, setStatus] = useState<GpsState['status']>('idle');
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<GpsFix | null> => {
    setStatus('requesting');
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setStatus('denied');
        setError('Location permission denied — photo will be uploaded without GPS.');
        return null;
      }
      setStatus('granted');
      const last = await Location.getLastKnownPositionAsync();
      const pos =
        last ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!pos) {
        setError('GPS position unavailable right now.');
        return null;
      }
      const next: GpsFix = {
        latitude: Number(pos.coords.latitude.toFixed(7)),
        longitude: Number(pos.coords.longitude.toFixed(7)),
        captured_at: new Date().toISOString(),
      };
      setFix(next);
      return next;
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Could not read GPS position.');
      return null;
    }
  }, []);

  return { fix, status, error, capture };
}
