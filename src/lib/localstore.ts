import { USE_LOCAL_STORE, onDbChange, openPersistentRelayDB, type RelayDB } from '@/db/db';
import { exportAll, importAll, type BackupFile } from '@/lib/backup';
import type { Connection } from '@/db/types';
import { useUiStore } from '@/store/ui';

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
 *
 * A failed flush is NEVER silent: it retries on its own timer (an idle app
 * would otherwise never retry), flips the header to UNSAVED via `dataStatus`,
 * and `beforeunload` blocks an accidental refresh while changes are pending —
 * the browser memory may be the only copy of a just-finished reply.
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
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 10_000;

let initialized = false; // guard against React StrictMode's double-mount
let hooksAttached = false;
let applyingLocal = false; // suppress write-through while importing into the DB
let dirty = false;
let rev = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let current: Promise<void> | null = null; // the upload in flight, if any
/** A hung PUT (dropped share, stuck proxy) must surface as UNSAVED and retry. */
const WRITE_TIMEOUT_MS = 120_000;
let retryDelay = RETRY_BASE_MS; // backoff for failed flushes; reset on success

const setDataStatus = (s: 'saved' | 'saving' | 'error', error = '') =>
  useUiStore.getState().setDataStatus(s, error);

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
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j: { error?: string }) => j.error)
      .catch(() => null);
    throw new Error(detail || `Data write failed (${res.status})`);
  }
  rev = snap.rev;
}

/** Write pending changes now, cancelling any pending debounce. A failure keeps
 *  the changes dirty, flips the UNSAVED indicator, and retries with backoff. */
export async function flushLocalStore(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!dirty || writing) return;
  writing = true;
  dirty = false;
  setDataStatus('saving');
  current = upload();
  await current;
}

async function upload(): Promise<void> {
  try {
    await writeSnapshot();
    retryDelay = RETRY_BASE_MS;
    if (dirty) {
      // Changes landed during the upload — they're pending, not saved.
      // Arm the timer directly: scheduleWrite() would no-op while `writing`
      // is still true (it clears only in the finally below).
      setDataStatus('saving');
      writeTimer = setTimeout(() => {
        writeTimer = null;
        void flushLocalStore();
      }, WRITE_DEBOUNCE_MS);
    } else {
      setDataStatus('saved');
    }
  } catch (e) {
    dirty = true; // keep the change pending
    setDataStatus('error', e instanceof Error ? e.message : String(e));
    // Retry on our own clock: waiting for "a later edit" means an idle app
    // (reply finished, user reading) would never save again.
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void flushLocalStore();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  } finally {
    writing = false;
    current = null;
  }
}

/** Save now and resolve only once the data file holds every change, else
 *  throw. For actions that reload the page right after (restores), which
 *  would otherwise race the debounced write and lose what they imported. */
export async function persistLocalStore(): Promise<void> {
  if (!USE_LOCAL_STORE || !initialized) return;
  // Changes can keep landing (a streaming reply); give them a few passes.
  for (let i = 0; i < 3 && (dirty || writing); i++) {
    await current; // an upload already running
    await flushLocalStore(); // whatever is still pending
    if (useUiStore.getState().dataStatus === 'error') break;
  }
  if (dirty || writing) {
    throw new Error(
      useUiStore.getState().dataError || "Couldn't save to the data file.",
    );
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
  onDbChange(() => {
    if (applyingLocal) return;
    dirty = true;
    scheduleWrite();
  });
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
 * Hand the pre-M9 persistent store's secrets to the proxy's secret store. Read
 * straight from the old DB (which still holds them inline) and POST to
 * `/api/secrets/*`; the connection ids match the records just loaded into the
 * in-memory DB, so the proxy can resolve them by id afterwards.
 */
async function handoffPersistentSecrets(persistent: RelayDB): Promise<boolean> {
  let ok = true;
  for (const conn of await persistent.connections.toArray()) {
    const legacy = conn as Connection & { apiKey?: string; privateKey?: string };
    const patch: { apiKey?: string; privateKey?: string } = {};
    if (legacy.apiKey) patch.apiKey = legacy.apiKey;
    if (legacy.privateKey) patch.privateKey = legacy.privateKey;
    if (patch.apiKey || patch.privateKey) {
      const res = await fetch(`/api/secrets/connection/${conn.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res?.ok) ok = false;
    }
  }
  const cfg = (await persistent.appConfig.get('singleton')) as
    | { webdav?: { pass?: string } }
    | undefined;
  if (cfg?.webdav?.pass) {
    const res = await fetch('/api/secrets/webdav', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pass: cfg.webdav.pass }),
    }).catch(() => null);
    if (!res?.ok) ok = false;
  }
  return ok;
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
  let keysMoved = true;
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
      // The dump/file are secret-free (exportAll strips them); move the old
      // store's keys straight into the proxy's secret store, keyed by the same
      // connection ids the in-memory DB now holds.
      keysMoved = await handoffPersistentSecrets(persistent);
    }
  } finally {
    persistent.close();
  }

  // The old store is the only copy of any key the proxy refused: keep it.
  if (!keysMoved) {
    console.warn('Relay: some saved keys did not reach the key store; the old browser store is kept.');
    return true;
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
  initialized = true;
  setDataStatus('saved');
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushLocalStore();
    });
    window.addEventListener('beforeunload', (e) => {
      void flushLocalStore();
      // Unsaved changes: the in-memory DB may be their only copy. Make the
      // browser ask before the page (and the data) is thrown away.
      if (dirty || writing) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
}

/** Where the data lives + how big it is (Settings readout). */
export async function getDataInfo(): Promise<DataInfo> {
  const res = await fetch('/api/data/info');
  if (!res.ok) throw new Error(`Data info failed (${res.status})`);
  return res.json();
}
