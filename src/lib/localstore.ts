import { USE_LOCAL_STORE, db, openPersistentRelayDB } from '@/db/db';
import { exportAll, importAll, type BackupFile } from '@/lib/backup';

/**
 * Local data store engine (ARCHITECTURE.md §4 "Storage & sync").
 *
 * The app's DB is an in-memory IndexedDB (see `db.ts`); this module makes a
 * single snapshot file on disk — owned by the proxy at `/api/data` — its
 * durable home, OFF the browser profile / C: drive:
 *
 *   - on boot, load the file into the in-memory DB (or, on first M9 run, migrate
 *     the old persistent `relay` IndexedDB into the file and free C:);
 *   - on any change, write the whole DB back to the file, short-debounced
 *     (~400 ms; local disk is fast) plus an immediate flush when the tab hides.
 *
 * Mirrors the `applying…`/`dirty`/rev pattern in `webdav.ts`. The proxy MUST be
 * running to load or save (no offline-without-server) — boot surfaces a clear
 * error if it isn't. Two tabs of the same origin are last-write-wins.
 */

interface DataSnapshot {
  rev: number;
  savedAt: number;
  data: BackupFile;
}

export interface DataInfo {
  path: string;
  exists: boolean;
  size?: number;
  savedAt?: number;
}

const WRITE_DEBOUNCE_MS = 400;

let initialized = false; // guard against React StrictMode's double-mount
let hooksAttached = false;
let applyingLocal = false; // suppress write-through while importing into the DB
let dirty = false;
let rev = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writing = false;

async function fetchSnapshot(): Promise<DataSnapshot | null> {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error(`Data service responded ${res.status}`);
  const body = (await res.json()) as Partial<DataSnapshot>;
  if (!body || !body.data) {
    rev = body?.rev ?? 0;
    return null;
  }
  return body as DataSnapshot;
}

async function writeSnapshot(): Promise<void> {
  const data = await exportAll();
  const snap: DataSnapshot = { rev: rev + 1, savedAt: Date.now(), data };
  const res = await fetch('/api/data', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snap),
  });
  if (!res.ok) throw new Error(`Data write failed (${res.status})`);
  rev = snap.rev;
}

/** Write pending changes now, cancelling any pending debounce. Best-effort. */
export async function flushLocalStore(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!dirty || writing) return;
  writing = true;
  dirty = false;
  try {
    await writeSnapshot();
  } catch {
    dirty = true; // keep the change pending; a later edit/flush retries
  } finally {
    writing = false;
  }
}

function scheduleWrite(): void {
  if (writeTimer || writing) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void flushLocalStore();
  }, WRITE_DEBOUNCE_MS);
}

function attachHooks(): void {
  if (hooksAttached) return;
  hooksAttached = true;
  const onChange = () => {
    if (applyingLocal) return;
    dirty = true;
    scheduleWrite();
  };
  for (const table of db.tables) {
    const hook = (
      table as unknown as { hook: (e: string, cb: () => void) => void }
    ).hook;
    hook.call(table, 'creating', onChange);
    hook.call(table, 'updating', onChange);
    hook.call(table, 'deleting', onChange);
  }
}

/** Import a snapshot into the in-memory DB without re-triggering write-through. */
async function loadIntoMemory(data: BackupFile): Promise<void> {
  applyingLocal = true;
  try {
    await importAll(data);
  } finally {
    applyingLocal = false;
  }
}

/**
 * One-time migration: if a *persistent* `relay` IndexedDB still exists (pre-M9),
 * move it into the data file, then delete it to actually free C:. Runs only when
 * the data file is empty. No-op (returns false) on browsers that can't enumerate
 * databases — they simply start fresh from the file.
 */
async function migrateFromPersistent(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function')
    return false;
  let names: string[];
  try {
    names = (await indexedDB.databases()).map((d) => d.name ?? '');
  } catch {
    return false;
  }
  if (!names.includes('relay')) return false;

  const persistent = openPersistentRelayDB();
  try {
    await persistent.open();
    const hasData =
      (await persistent.messages.count()) > 0 ||
      (await persistent.connections.count()) > 0 ||
      (await persistent.sessions.count()) > 0 ||
      (await persistent.folders.count()) > 0;
    if (hasData) {
      const dump = await exportAll(persistent);
      await loadIntoMemory(dump);
      await writeSnapshot(); // persist the migrated data as the file's first rev
    }
  } finally {
    persistent.close();
  }

  // Free the on-disk copy (migrated, or an empty leftover) — the file is the
  // source of truth now.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('relay');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  return true;
}

/** Load the data file into the in-memory DB and start write-through. Resolves
 *  when the app is safe to render; throws if the proxy is unreachable. */
export async function initLocalStore(): Promise<void> {
  if (!USE_LOCAL_STORE) return; // persistent-IndexedDB mode: nothing to do
  if (initialized) return;
  initialized = true;

  const snap = await fetchSnapshot();
  if (snap) {
    await loadIntoMemory(snap.data);
  } else {
    // Empty file → bring over the old persistent store if there is one. If not,
    // the DB stays empty and `ensureDefaultPreset()` seeds it (which then writes
    // the first file via the hooks attached below).
    await migrateFromPersistent();
  }

  attachHooks();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushLocalStore();
    });
    window.addEventListener('beforeunload', () => void flushLocalStore());
  }
}

/** Where the data lives + how big it is (Settings readout). */
export async function getDataInfo(): Promise<DataInfo> {
  const res = await fetch('/api/data/info');
  if (!res.ok) throw new Error(`Data info failed (${res.status})`);
  return res.json();
}
