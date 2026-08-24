import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, filePart } from '../api/client';

const QUEUE_KEY = '@cerp/offline-queue';

export type QueueItemKind = 'progress' | 'issue';

export interface QueuedPhoto {
  uri: string;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  source: 'camera' | 'upload';
}

export interface QueueItem {
  /** Unique client reference — used for server-side duplicate protection. */
  client_ref: string;
  kind: QueueItemKind;
  title: string;
  created_at: string;
  payload: Record<string, unknown>;
  photos: QueuedPhoto[];
  attempts: number;
  last_error: string | null;
}

export function newClientRef(): string {
  return `mob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueue(item: Omit<QueueItem, 'attempts' | 'last_error'>): Promise<void> {
  const items = await getQueue();
  // Idempotent enqueue — same client_ref never enters twice
  if (items.some((i) => i.client_ref === item.client_ref)) return;
  items.push({ ...item, attempts: 0, last_error: null });
  await persist(items);
  notifyListeners();
}

export async function removeFromQueue(clientRef: string): Promise<void> {
  const items = await getQueue();
  await persist(items.filter((i) => i.client_ref !== clientRef));
  notifyListeners();
}

export async function clearSynced(): Promise<number> {
  const items = await getQueue();
  const remaining = items.filter((i) => !i.last_error?.startsWith('SYNCED'));
  await persist(remaining);
  return items.length - remaining.length;
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

async function uploadProgress(item: QueueItem): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(item.payload)) {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  }
  form.append('client_ref', item.client_ref);
  if (item.photos.length) {
    item.photos.forEach((p) => form.append('photos', filePart(p.uri)));
    form.append(
      'photosMeta',
      JSON.stringify(
        item.photos.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          captured_at: p.captured_at,
          source: p.source,
        }))
      )
    );
  }
  await api.postForm('/progress', form);
}

async function uploadIssue(item: QueueItem): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(item.payload)) {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  }
  form.append('client_ref', item.client_ref);
  if (item.photos.length) {
    item.photos.forEach((p) => form.append('photos', filePart(p.uri, p.uri.split('/').pop() || 'issue.jpg')));
  }
  await api.postForm('/issues', form);
}

/** Push every queued item to the server. Server de-dupes via client_ref. */
export async function syncQueue(): Promise<SyncResult> {
  const items = await getQueue();
  let synced = 0;
  let failed = 0;
  const remaining: QueueItem[] = [];

  for (const item of items) {
    try {
      if (item.kind === 'progress') await uploadProgress(item);
      else await uploadIssue(item);
      synced += 1;
    } catch (err: any) {
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        last_error: err?.message || 'Upload failed',
      });
    }
  }

  await persist(remaining);
  notifyListeners();
  return { synced, failed, remaining: remaining.length };
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

// ---------------------------------------------------------------------------
// Subscription helpers (badge counts, auto-sync)
// ---------------------------------------------------------------------------

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  getQueue().then((items) => fn(items.length)).catch(() => fn(0));
  return () => listeners.delete(fn);
}

function notifyListeners() {
  getQueue()
    .then((items) => listeners.forEach((fn) => fn(items.length)))
    .catch(() => undefined);
}

let autoSyncStarted = false;

/** Start auto-sync: runs whenever connectivity comes back while the app is open. */
export function startAutoSync(): void {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      getQueue().then(async (items) => {
        if (items.length) await syncQueue().catch(() => undefined);
      });
    }
  });
}
