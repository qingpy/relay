import { db, getAppConfig, updateAppConfig } from '@/db/db';
import { exportAll, importAll, type BackupFile } from '@/lib/backup';
import type { WebDavConfig } from '@/db/types';
import { useUiStore } from '@/store/ui';

/**
 * WebDAV sync. Relay is local-first; this opportunistically mirrors the whole
 * DB to a single snapshot file on the user's WebDAV server (through the local
 * proxy, see `server/sync.ts`) so other devices can pick it up. It runs on a
 * schedule while the app is open (plus once on open, and on tab-hide), never
 * on every keystroke. Single user, so conflicts are last-write-wins — with two
 * guards so a sync can't silently destroy data:
 *   - a brand-new device with its own chats won't auto-pull over them, nor
 *     auto-push its (empty) state over an existing cloud copy — that ambiguous
 *     case asks the user to pick Restore or Back up;
 *   - a device with unsynced local edits pushes (it wins) rather than pulling.
 */

const SNAPSHOT = 'relay-state.json';
const REV_KEY = 'relay.webdav.rev';
const LAST_KEY = 'relay.webdav.lastSyncAt';
const DEFAULT_INTERVAL_HOURS = 1;

interface Snapshot {
  rev: number;
  savedAt: number;
  data: BackupFile;
}

let hooksAttached = false;
let initialized = false; // guard against React StrictMode's double-mount
let applyingRemote = false; // suppress the dirty flag while importing a pull
let dirty = false;
let message = '';

class ConflictError extends Error {}

const getRev = () => Number(localStorage.getItem(REV_KEY) || 0);
const setRev = (r: number) => localStorage.setItem(REV_KEY, String(r));
const setLastSync = (t: number) => localStorage.setItem(LAST_KEY, String(t));
export const getLastSync = (): number =>
  Number(localStorage.getItem(LAST_KEY) || 0);
export const getSyncMessage = (): string => message;

const setStatus = (s: 'off' | 'syncing' | 'synced' | 'error', msg = '') => {
  message = msg;
  useUiStore.getState().setSyncStatus(s);
};

function configured(c?: WebDavConfig): c is WebDavConfig {
  return !!(c && c.enabled && c.url && c.user && c.pass);
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function authOf(c: WebDavConfig): string {
  // UTF-8 safe base64 of "user:pass".
  return btoa(unescape(encodeURIComponent(`${c.user}:${c.pass}`)));
}

function folder(c: WebDavConfig): string {
  return (c.path || 'relay').replace(/^\/+|\/+$/g, '');
}

function fileUrl(c: WebDavConfig): string {
  return `${trimSlash(c.url)}/${folder(c)}/${SNAPSHOT}`;
}

function headers(c: WebDavConfig): Record<string, string> {
  return { 'x-webdav-url': fileUrl(c), 'x-webdav-auth': authOf(c) };
}

/** Verify URL + credentials against the server (used by the Settings "Test"). */
export async function testWebdav(
  c: WebDavConfig,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch('/api/sync/test', {
      method: 'POST',
      headers: { 'x-webdav-url': trimSlash(c.url), 'x-webdav-auth': authOf(c) },
    });
    if (res.ok) return { ok: true, status: (await res.json()).status };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function pull(c: WebDavConfig): Promise<Snapshot | null> {
  const res = await fetch('/api/sync', { headers: headers(c) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Pull failed (${res.status})`);
  }
  return (await res.json()) as Snapshot;
}

async function applyRemote(snap: Snapshot): Promise<void> {
  applyingRemote = true;
  try {
    await importAll(snap.data);
    setRev(snap.rev);
    dirty = false;
  } finally {
    applyingRemote = false;
  }
}

async function push(c: WebDavConfig, baseRev: number): Promise<void> {
  dirty = false; // clear up-front; writes during the upload re-flag it
  let data: BackupFile;
  try {
    data = await exportAll();
    const snap: Snapshot = { rev: baseRev + 1, savedAt: Date.now(), data };
    const res = await fetch('/api/sync', {
      method: 'PUT',
      headers: { ...headers(c), 'content-type': 'application/json' },
      body: JSON.stringify(snap),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error || `Push failed (${res.status})`);
    }
    setRev(snap.rev);
  } catch (e) {
    dirty = true; // upload failed — keep the change pending
    throw e;
  }
}

/** Decide a direction and do it. `manual` forces push/pull (the buttons). */
async function reconcile(manual?: 'push' | 'pull'): Promise<void> {
  const cfg = (await getAppConfig()).webdav;
  if (!configured(cfg)) {
    setStatus('off');
    return;
  }
  setStatus('syncing');
  try {
    const remote = await pull(cfg);

    if (manual === 'pull') {
      if (remote) await applyRemote(remote);
      else throw new Error('Nothing stored on the server yet.');
    } else if (manual === 'push') {
      await push(cfg, remote?.rev ?? 0);
    } else if (!remote) {
      // Cloud is empty: seed it from local (only if there's anything to send).
      if ((await db.messages.count()) > 0 || dirty || getRev() > 0)
        await push(cfg, 0);
    } else if (getRev() === 0) {
      // This device has never synced.
      if ((await db.messages.count()) === 0) {
        await applyRemote(remote); // fresh device → adopt the cloud copy
      } else {
        throw new ConflictError(
          'This device and the server both have data. Use “Restore from server” to take the server copy, or “Back up to server” to overwrite it with this device.',
        );
      }
    } else if (dirty) {
      await push(cfg, remote.rev); // local edits win
    } else if (remote.rev > getRev()) {
      await applyRemote(remote); // cloud advanced elsewhere → take it
    }

    setLastSync(Date.now());
    setStatus('synced');
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : String(e));
    if (manual) throw e; // surface to the button; scheduled runs stay quiet
  }
}

function attachHooks(): void {
  if (hooksAttached) return;
  hooksAttached = true;
  const onChange = () => {
    if (!applyingRemote) dirty = true;
  };
  for (const table of db.tables) {
    const hook = (table as unknown as { hook: (e: string, cb: () => void) => void })
      .hook;
    hook.call(table, 'creating', onChange);
    hook.call(table, 'updating', onChange);
    hook.call(table, 'deleting', onChange);
  }
}

/** Attach change tracking and do an initial sync on app open. */
export async function initWebdavSync(): Promise<void> {
  if (initialized) return;
  initialized = true;
  attachHooks();
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) void reconcile();
  });
  const cfg = (await getAppConfig()).webdav;
  if (!configured(cfg)) {
    setStatus('off');
    return;
  }
  await reconcile();
}

/** Called on a timer by the app; syncs only when due. */
export async function maybeRunScheduledWebdavSync(): Promise<void> {
  const cfg = (await getAppConfig()).webdav;
  if (!configured(cfg)) return;
  const intervalMs =
    Math.max(1, cfg.intervalHours ?? DEFAULT_INTERVAL_HOURS) * 3_600_000;
  if (Date.now() - getLastSync() < intervalMs) return;
  await reconcile();
}

/** Manual actions for the Settings panel. */
export const syncNow = () => reconcile();
export const backupToWebdav = () => reconcile('push');
export const restoreFromWebdav = () => reconcile('pull');

/** Persist config changes from Settings, then sync immediately if enabled. */
export async function saveWebdavConfig(patch: Partial<WebDavConfig>): Promise<void> {
  const cur = (await getAppConfig()).webdav;
  const next: WebDavConfig = {
    url: '',
    user: '',
    pass: '',
    path: 'relay',
    enabled: false,
    ...cur,
    ...patch,
  };
  await updateAppConfig({ webdav: next });
  if (configured(next)) void reconcile();
  else setStatus('off');
}
