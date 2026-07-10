import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { json } from './util.ts';

/**
 * Local backup storage. The browser holds the data (IndexedDB) and POSTs a
 * full dump here; the proxy writes it to disk so backups survive a cleared
 * browser and persist on a VPS. Set `RELAY_BACKUP_DIR` to a durable path in
 * production.
 */
export const backup = new Hono();

const BACKUP_DIR = process.env.RELAY_BACKUP_DIR || join(process.cwd(), 'backups');
const NAME_RE = /^[\w.\-]+\.json$/;

async function ensureDir(): Promise<void> {
  if (!existsSync(BACKUP_DIR)) await mkdir(BACKUP_DIR, { recursive: true });
}

/** Reject anything that isn't a plain `*.json` basename (no path traversal). */
function safeName(name: string): string | null {
  if (!NAME_RE.test(name) || name.includes('..')) return null;
  return name;
}

/** Millisecond-precise so two backups written the same second (scheduled +
 *  manual) never collide on the same name, which would silently overwrite. */
function stamp(): string {
  const t = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
    `-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}` +
    pad(t.getMilliseconds(), 3)
  );
}

// Write a backup. Body: the backup JSON (optionally `{ label }` query).
backup.post('/', async (c) => {
  const body = await c.req.text();
  if (!body) return json({ error: 'Empty backup body.' }, 400);
  const rawLabel = c.req.query('label') ?? '';
  const label = rawLabel.replace(/[^\w\-]/g, '').slice(0, 24);
  await ensureDir();
  const name = `relay-backup-${stamp()}${label ? `-${label}` : ''}.json`;
  await writeFile(join(BACKUP_DIR, name), body, 'utf-8');
  return json({ name });
});

// List stored backups, newest first.
backup.get('/', async (c) => {
  await ensureDir();
  const names = (await readdir(BACKUP_DIR)).filter((n) => NAME_RE.test(n));
  const items = await Promise.all(
    names.map(async (name) => {
      const s = await stat(join(BACKUP_DIR, name));
      return { name, size: s.size, mtime: s.mtimeMs };
    }),
  );
  items.sort((a, b) => b.mtime - a.mtime);
  return c.json({ dir: BACKUP_DIR, backups: items });
});

// Download one backup's JSON.
backup.get('/:name', async (c) => {
  const name = safeName(c.req.param('name'));
  if (!name) return json({ error: 'Invalid name.' }, 400);
  const path = join(BACKUP_DIR, name);
  if (!existsSync(path)) return json({ error: 'Not found.' }, 404);
  return new Response(await readFile(path, 'utf-8'), {
    headers: { 'content-type': 'application/json' },
  });
});

backup.delete('/:name', async (c) => {
  const name = safeName(c.req.param('name'));
  if (!name) return json({ error: 'Invalid name.' }, 400);
  const path = join(BACKUP_DIR, name);
  if (existsSync(path)) await unlink(path);
  return json({ ok: true });
});
