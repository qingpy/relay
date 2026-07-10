import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { atomicWrite, json, withRetry } from './util.ts';

/**
 * Local data store (ARCHITECTURE.md §4 "Storage & sync").
 *
 * Relay's source of truth lives in ONE snapshot file on disk — off the browser,
 * at a path the user controls — owned by this proxy. The browser holds the data
 * only in an in-memory IndexedDB (nothing persists to the browser profile / C:)
 * and reads/writes the whole snapshot through these endpoints:
 *
 *   GET  /api/data        -> { rev, savedAt, data } (or { rev: 0 } if no file)
 *   PUT  /api/data        -> atomically write { rev, savedAt, data }
 *   GET  /api/data/info    -> { path, exists, size, savedAt } for the Settings readout
 *   GET  /api/data/sync-state -> { rev, lastSyncAt } the durable WebDAV sync cursor
 *   PUT  /api/data/sync-state -> persist { rev, lastSyncAt }
 *
 * The payload `data` is the same `BackupFile` produced by the client's
 * `exportAll()` — so the disk file, a downloaded backup, and the WebDAV snapshot
 * are all the same shape.
 *
 * The WebDAV sync cursor (which server `rev` this machine's data is synced to)
 * lives in a sidecar next to the data file rather than browser localStorage, so
 * every browser / profile / origin on the machine shares one cursor — a fresh
 * localStorage no longer reads as a never-synced device and falsely conflicts.
 *
 * I/O is retried on the transient Windows lock errors (EBUSY/EPERM — an AV
 * scan or a colliding handle); a real failure returns its detail, which the
 * client surfaces as UNSAVED and retries on its own clock.
 */
export const data = new Hono();

/** Resolve the data file path (env override, else ./data/relay.json under cwd). */
function dataFile(): string {
  const env = process.env.RELAY_DATA_FILE?.trim();
  if (env) return isAbsolute(env) ? env : join(process.cwd(), env);
  return join(process.cwd(), 'data', 'relay.json');
}

/** Sidecar holding the WebDAV sync cursor, beside the data file it belongs to. */
function syncStateFile(): string {
  return `${dataFile()}.sync`;
}

// Read the current snapshot. Missing file -> a fresh, empty store.
data.get('/', async (c) => {
  const file = dataFile();
  if (!existsSync(file)) return c.json({ rev: 0 });
  try {
    return new Response(await withRetry(() => readFile(file, 'utf-8')), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return json({ error: `Couldn't read data file: ${String(e)}` }, 500);
  }
});

// Where the data lives + how big it is, for the Settings readout.
data.get('/info', async (c) => {
  const file = dataFile();
  if (!existsSync(file)) return c.json({ path: file, exists: false });
  try {
    const s = await stat(file);
    // savedAt is read from the snapshot when present; fall back to mtime.
    let savedAt = s.mtimeMs;
    try {
      const parsed = JSON.parse(await readFile(file, 'utf-8')) as {
        savedAt?: number;
      };
      if (typeof parsed.savedAt === 'number') savedAt = parsed.savedAt;
    } catch {
      /* keep mtime */
    }
    return c.json({ path: file, exists: true, size: s.size, savedAt });
  } catch (e) {
    return json({ error: `Couldn't stat data file: ${String(e)}` }, 500);
  }
});

// The durable WebDAV sync cursor (see header). Missing sidecar -> rev 0, which
// the client migrates from its legacy localStorage cursor on first run.
data.get('/sync-state', async (c) => {
  const file = syncStateFile();
  if (!existsSync(file)) return c.json({ rev: 0, lastSyncAt: 0 });
  try {
    const parsed = JSON.parse(await withRetry(() => readFile(file, 'utf-8'))) as {
      rev?: number;
      lastSyncAt?: number;
    };
    return c.json({ rev: parsed.rev ?? 0, lastSyncAt: parsed.lastSyncAt ?? 0 });
  } catch {
    return c.json({ rev: 0, lastSyncAt: 0 });
  }
});

// Persist the cursor. Atomic temp-file + rename, like the data write.
data.put('/sync-state', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    rev?: number;
    lastSyncAt?: number;
  } | null;
  if (!body || typeof body.rev !== 'number') {
    return json({ error: 'Expected { rev, lastSyncAt }.' }, 400);
  }
  const file = syncStateFile();
  const payload = JSON.stringify({ rev: body.rev, lastSyncAt: body.lastSyncAt ?? 0 });
  try {
    await atomicWrite(file, payload);
    return c.json({ ok: true });
  } catch (e) {
    return json({ error: `Couldn't write sync state: ${String(e)}` }, 500);
  }
});

// Replace the snapshot. Atomic: write a temp file then rename over the target,
// so a crash mid-write can never leave a half-written store.
data.put('/', async (c) => {
  const body = await c.req.text();
  if (!body) return json({ error: 'Empty body.' }, 400);
  const file = dataFile();
  try {
    await atomicWrite(file, body);
    return c.json({ ok: true });
  } catch (e) {
    return json({ error: `Couldn't write data file: ${String(e)}` }, 500);
  }
});
