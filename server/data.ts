import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

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
 *
 * The payload `data` is the same `BackupFile` produced by the client's
 * `exportAll()` — so the disk file, a downloaded backup, and the WebDAV snapshot
 * are all the same shape.
 */
export const data = new Hono();

/** Resolve the data file path (env override, else ./data/relay.json under cwd). */
function dataFile(): string {
  const env = process.env.RELAY_DATA_FILE?.trim();
  if (env) return isAbsolute(env) ? env : join(process.cwd(), env);
  return join(process.cwd(), 'data', 'relay.json');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Read the current snapshot. Missing file -> a fresh, empty store.
data.get('/', async (c) => {
  const file = dataFile();
  if (!existsSync(file)) return c.json({ rev: 0 });
  try {
    return new Response(await readFile(file, 'utf-8'), {
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

// Replace the snapshot. Atomic: write a temp file then rename over the target,
// so a crash mid-write can never leave a half-written store.
data.put('/', async (c) => {
  const body = await c.req.text();
  if (!body) return json({ error: 'Empty body.' }, 400);
  const file = dataFile();
  try {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, body, 'utf-8');
    await rename(tmp, file);
    return c.json({ ok: true });
  } catch (e) {
    return json({ error: `Couldn't write data file: ${String(e)}` }, 500);
  }
});
