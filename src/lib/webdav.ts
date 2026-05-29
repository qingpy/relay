import { db, getAppConfig, updateAppConfig } from '@/db/db';
import { exportAll, importAll, type BackupFile } from '@/lib/backup';
import { webdavSecretSet } from '@/lib/secrets';
import type { WebDavConfig } from '@/db/types';
import { useUiStore } from '@/store/ui';

/**
 * WebDAV sync. Relay is local-first; this opportunistically mirrors the whole
 * DB to a single snapshot file on the user's WebDAV server (through the local
 * proxy, see `server/sync.ts`) so other devices can pick it up. It runs on a
 * schedule while the app is open (plus once on open, and on tab-hide), never
 * on every keystroke. Single user, so conflicts are last-write-wins — but no
 * *automatic* sync may ever destroy data, so:
 *   - the cloud is auto-adopted only onto a genuinely pristine device (nothing
 *     to lose); a device with real content conflicts instead (asks the user);
 *   - a blank/empty remote never auto-overwrites a device that has content —
 *     local wins (pushes), or it conflicts;
 *   - a pristine device never seeds a blank snapshot to the cloud;
 *   - a device with unsynced local edits pushes (it wins) rather than pulling.
 * Only the explicit, confirmed "Restore from server" button force-pulls.
 */

const SNAPSHOT = 'relay-state.json';
const REV_KEY = 'relay.webdav.rev';
const LAST_KEY = 'relay.webdav.lastSyncAt';
const DEFAULT_INTERVAL_HOURS = 1;
/** Versioned backups default on (keep 10); set `backupsKeep` to 0 to disable. */
const DEFAULT_BACKUPS_KEEP = 10;

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
  // The password lives in the proxy's secret store, not the config, so "ready
  // to sync" requires a stored password (webdavSecretSet) rather than a field.
  return !!(c && c.enabled && c.url && c.user && webdavSecretSet());
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function folder(c: WebDavConfig): string {
  return (c.path || 'relay').replace(/^\/+|\/+$/g, '');
}

function fileUrl(c: WebDavConfig): string {
  return `${trimSlash(c.url)}/${folder(c)}/${SNAPSHOT}`;
}

function headers(c: WebDavConfig): Record<string, string> {
  // No password here — the proxy adds the stored one and builds Basic auth.
  return { 'x-webdav-url': fileUrl(c), 'x-webdav-user': c.user };
}

/** Verify URL + credentials against the server (used by the Settings "Test").
 *  `pass` is the just-typed password; if empty the proxy uses the stored one. */
export async function testWebdav(
  c: WebDavConfig,
  pass: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch('/api/sync/test', {
      method: 'POST',
      headers: {
        'x-webdav-url': trimSlash(c.url),
        'x-webdav-user': c.user,
        'x-webdav-pass': pass,
      },
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

/** Whether this device holds real data — anything beyond the freshly-seeded
 *  default connection + preset. If false, adopting the cloud loses nothing. */
async function localHasContent(): Promise<boolean> {
  const [messages, sessions, prompts, folders, connections] = await Promise.all([
    db.messages.count(),
    db.sessions.count(),
    db.prompts.count(),
    db.folders.count(),
    db.connections.toArray(),
  ]);
  if (messages > 0 || sessions > 0 || prompts > 0) return true;
  if (folders > 1 || connections.length > 1) return true;
  return connections.some((c) => c.models.length > 0);
}

/** Same test against a remote snapshot: a default-only snapshot counts as
 *  "empty", so it's never auto-applied over real local content. */
function snapshotHasContent(snap: Snapshot): boolean {
  const d = snap.data?.data;
  if (!d) return false;
  if ((d.sessions?.length ?? 0) > 0) return true;
  if ((d.messages?.length ?? 0) > 0) return true;
  if ((d.prompts?.length ?? 0) > 0) return true;
  if ((d.folders?.length ?? 0) > 1) return true;
  if ((d.connections?.length ?? 0) > 1) return true;
  return (d.connections ?? []).some((c) => c.models.length > 0);
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

// --- Versioned backups -----------------------------------------------------
//
// Alongside the single live snapshot (cross-device sync), Relay keeps a rolling
// set of timestamped backups in a `backups/` subfolder so any past version can
// be restored. One is written every `intervalHours` (the same cadence as sync)
// and on demand; older ones beyond `backupsKeep` are pruned. Backups go through
// `exportAll()`, so — like everything else — they carry no credentials.

export interface WebdavBackup {
  name: string;
  mtime: number;
  size: number;
}

function backupsFolderUrl(c: WebDavConfig): string {
  return `${trimSlash(c.url)}/${folder(c)}/backups`;
}

function backupFileUrl(c: WebDavConfig, name: string): string {
  return `${backupsFolderUrl(c)}/${name}`;
}

/** A unique, sortable backup filename. Millisecond-precise so two backups taken
 *  in the same second never collide on the same name (which would overwrite). */
function backupName(): string {
  const t = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `relay-backup-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}` +
    `-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}${p(t.getMilliseconds(), 3)}.json`
  );
}

/** Headers for a request aimed at an arbitrary WebDAV URL (not the snapshot). */
function urlHeaders(c: WebDavConfig, url: string): Record<string, string> {
  return { 'x-webdav-url': url, 'x-webdav-user': c.user };
}

/** Parse a WebDAV PROPFIND multistatus into backup entries, newest first. */
function parseBackupList(xml: string): WebdavBackup[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: WebdavBackup[] = [];
  for (const r of Array.from(doc.getElementsByTagNameNS('*', 'response'))) {
    const href = r.getElementsByTagNameNS('*', 'href')[0]?.textContent ?? '';
    const name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '');
    if (!/^relay-backup-.*\.json$/i.test(name)) continue; // skip the folder + strays
    const lm = r.getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent ?? '';
    const len = r.getElementsByTagNameNS('*', 'getcontentlength')[0]?.textContent ?? '';
    out.push({ name, mtime: lm ? Date.parse(lm) : 0, size: len ? Number(len) : 0 });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** List the versioned backups on the server, newest first. */
export async function listWebdavBackups(): Promise<WebdavBackup[]> {
  const c = (await getAppConfig()).webdav;
  if (!configured(c)) return [];
  const res = await fetch('/api/sync/list', {
    method: 'POST',
    headers: urlHeaders(c, backupsFolderUrl(c)),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Couldn't list backups (${res.status})`);
  }
  return parseBackupList(((await res.json()) as { xml: string }).xml);
}

/** Write a timestamped, credential-free snapshot into the backups folder
 *  (created on demand), then prune to the retention count. */
async function writeWebdavBackup(c: WebDavConfig): Promise<void> {
  const data = await exportAll();
  const res = await fetch('/api/sync', {
    method: 'PUT',
    headers: {
      ...urlHeaders(c, backupFileUrl(c, backupName())),
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Backup failed (${res.status})`);
  }
  await pruneWebdavBackups(c, c.backupsKeep ?? DEFAULT_BACKUPS_KEEP);
}

async function pruneWebdavBackups(c: WebDavConfig, keep: number): Promise<void> {
  if (keep <= 0) return;
  const stale = (await listWebdavBackups()).slice(keep);
  for (const b of stale) {
    await fetch('/api/sync', {
      method: 'DELETE',
      headers: urlHeaders(c, backupFileUrl(c, b.name)),
    });
  }
}

/** Restore a chosen server backup, replacing ALL local data. */
export async function restoreWebdavBackup(name: string): Promise<void> {
  const c = (await getAppConfig()).webdav;
  if (!configured(c)) throw new Error('WebDAV is not configured.');
  const res = await fetch('/api/sync', { headers: urlHeaders(c, backupFileUrl(c, name)) });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Couldn't read backup (${res.status})`);
  }
  await importAll((await res.json()) as BackupFile);
}

/** Delete a chosen server backup. */
export async function deleteWebdavBackup(name: string): Promise<void> {
  const c = (await getAppConfig()).webdav;
  if (!configured(c)) return;
  await fetch('/api/sync', {
    method: 'DELETE',
    headers: urlHeaders(c, backupFileUrl(c, name)),
  });
}

/** Write a versioned backup right now (the manual "Backup" button), pruning to
 *  the retention count. No-op when backups are turned off (Keep 0). Not gated by
 *  the interval — each manual backup leaves its own restore point. */
export async function backupNowToWebdav(): Promise<void> {
  const c = (await getAppConfig()).webdav;
  if (!configured(c) || (c.backupsKeep ?? DEFAULT_BACKUPS_KEEP) <= 0) return;
  await writeWebdavBackup(c);
  await persistWebdavConfig({ lastWebdavBackupAt: Date.now() });
}

let backingUp = false;
/** App timer: write one versioned backup per `intervalHours` when retention is on. */
export async function maybeRunScheduledWebdavBackup(): Promise<void> {
  if (backingUp) return;
  const c = (await getAppConfig()).webdav;
  if (!configured(c) || (c.backupsKeep ?? DEFAULT_BACKUPS_KEEP) <= 0) return;
  const intervalMs =
    Math.max(1, c.intervalHours ?? DEFAULT_INTERVAL_HOURS) * 3_600_000;
  if (Date.now() - (c.lastWebdavBackupAt ?? 0) < intervalMs) return;
  backingUp = true;
  try {
    await writeWebdavBackup(c);
    await persistWebdavConfig({ lastWebdavBackupAt: Date.now() });
  } catch {
    // best-effort; the next tick retries
  } finally {
    backingUp = false;
  }
}

/**
 * Reconcile local and remote: pick a safe direction and do it. Never destroys
 * local data automatically — anything ambiguous pauses with a visible conflict,
 * and a past version can always be taken back via Restore (the backup list).
 */
async function reconcile(): Promise<void> {
  const cfg = (await getAppConfig()).webdav;
  if (!configured(cfg)) {
    setStatus('off');
    return;
  }
  setStatus('syncing');
  try {
    const remote = await pull(cfg);

    if (!remote) {
      // Cloud is empty: seed it from local — but only if this device has real
      // data, so a pristine device never plants a blank snapshot others adopt.
      if ((await localHasContent()) || getRev() > 0) await push(cfg, 0);
    } else if (getRev() === 0) {
      // First sync from this device against an existing cloud copy.
      if (!(await localHasContent())) {
        await applyRemote(remote); // pristine device → adopt the cloud copy
      } else if (!snapshotHasContent(remote)) {
        await push(cfg, remote.rev); // local has data, cloud is blank → local wins
      } else {
        throw new ConflictError(
          'This device and the server both have data — sync is paused so nothing is overwritten. Use Restore to adopt a server backup.',
        );
      }
    } else if (dirty) {
      await push(cfg, remote.rev); // local edits win
    } else if (remote.rev > getRev()) {
      // Cloud advanced elsewhere → take it, unless it's a blank snapshot that
      // would wipe real local data (e.g. an accidental/transient empty push).
      if (snapshotHasContent(remote) || !(await localHasContent())) {
        await applyRemote(remote);
      } else {
        throw new ConflictError(
          'The server copy is newer but empty — not overwriting local data. Use Restore to take a server backup if you meant to.',
        );
      }
    }

    setLastSync(Date.now());
    setStatus('synced');
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : String(e));
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

/** Manual sync from the Settings panel. */
export const syncNow = () => reconcile();

/** Persist config field changes without syncing. The Settings form auto-saves
 *  through this on every edit (like the rest of the app), so settings are never
 *  lost — the actual sync is triggered separately (enabling it, or the buttons). */
export async function persistWebdavConfig(
  patch: Partial<WebDavConfig>,
): Promise<void> {
  const cur = (await getAppConfig()).webdav;
  const next: WebDavConfig = {
    url: '',
    user: '',
    path: 'relay',
    enabled: false,
    ...cur,
    ...patch,
  };
  await updateAppConfig({ webdav: next });
}

/** Persist config changes from Settings, then sync immediately if enabled. */
export async function saveWebdavConfig(patch: Partial<WebDavConfig>): Promise<void> {
  await persistWebdavConfig(patch);
  if (configured((await getAppConfig()).webdav)) void reconcile();
  else setStatus('off');
}
