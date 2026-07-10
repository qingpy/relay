import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { atomicWrite, withRetry } from './util.ts';

/**
 * Server-side secret store (ARCHITECTURE.md §4 "Storage & sync").
 *
 * Credentials never belong in the data snapshot — that file is the browser's
 * in-memory DB, the WebDAV mirror, and every backup, so a key inside it leaks
 * everywhere (and into any agent reading the repo). Instead this proxy owns a
 * separate secrets file, keyed by connection id, that the snapshot never touches
 * and the browser never holds:
 *
 *   GET    /api/secrets/status            -> which ids have a key + whether WebDAV is set (booleans only)
 *   PUT    /api/secrets/connection/:id    -> set/clear a connection's { apiKey?, privateKey? }
 *   DELETE /api/secrets/connection/:id    -> drop a connection's secrets (on delete)
 *   PUT    /api/secrets/webdav            -> set/clear the WebDAV password
 *
 * Secret *values* are never returned over HTTP. The chat / models / sync routes
 * read them in-process via `getConnectionSecret` / `getWebdavPass`. The file
 * lives outside the repo by default (a per-user config dir), overridable with
 * `RELAY_SECRETS_FILE`.
 */
export const secrets = new Hono();

interface ConnectionSecret {
  apiKey?: string;
  privateKey?: string;
}

interface SecretStore {
  version: number;
  connections: Record<string, ConnectionSecret>;
  webdav?: { pass?: string };
}

/** Resolve the secrets file path: env override, else a per-user config dir
 *  (never inside the repo, so it's out of an agent's working tree). */
function secretsFile(): string {
  const env = process.env.RELAY_SECRETS_FILE?.trim();
  if (env) return isAbsolute(env) ? env : join(process.cwd(), env);
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'Relay', 'secrets.json');
}

// The proxy is the sole owner, so an in-process cache is safe and keeps the
// hot path (every chat request) off the disk after the first read.
let cache: SecretStore | null = null;

async function load(): Promise<SecretStore> {
  if (cache) return cache;
  const file = secretsFile();
  if (!existsSync(file)) {
    cache = { version: 1, connections: {} };
    return cache;
  }
  // A read failure must propagate (the request 500s and the next one retries):
  // caching an empty store here would blank every key for the process lifetime,
  // and the next save would persist that empty store over the real file.
  const raw = await withRetry(() => readFile(file, 'utf-8'));
  try {
    const parsed = JSON.parse(raw) as Partial<SecretStore>;
    cache = {
      version: 1,
      connections: parsed.connections ?? {},
      webdav: parsed.webdav,
    };
  } catch {
    throw new Error(`Secret store is not valid JSON: ${file}`);
  }
  return cache;
}

async function persist(store: SecretStore): Promise<void> {
  await atomicWrite(secretsFile(), JSON.stringify(store, null, 2));
  cache = store;
}

// --- In-process accessors (used by chat.ts / models.ts / sync.ts) ----------

export async function getConnectionSecret(
  id: string | undefined,
): Promise<ConnectionSecret | undefined> {
  if (!id) return undefined;
  return (await load()).connections[id];
}

export async function getWebdavPass(): Promise<string | undefined> {
  return (await load()).webdav?.pass;
}

// --- HTTP endpoints ---------------------------------------------------------

// Booleans only — never the secret values.
secrets.get('/status', async (c) => {
  const s = await load();
  const connections: Record<string, boolean> = {};
  for (const [id, sec] of Object.entries(s.connections)) {
    connections[id] = !!(sec.apiKey || sec.privateKey);
  }
  return c.json({ connections, webdav: !!s.webdav?.pass });
});

// Merge the provided fields: a non-empty value sets it, an empty string clears
// it, an absent field is left untouched.
secrets.put('/connection/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ apiKey?: string; privateKey?: string }>()
    .catch(() => ({}) as { apiKey?: string; privateKey?: string });

  const s = await load();
  const next: ConnectionSecret = { ...s.connections[id] };
  for (const field of ['apiKey', 'privateKey'] as const) {
    if (field in body) {
      const value = body[field];
      if (value) next[field] = value;
      else delete next[field];
    }
  }
  if (next.apiKey || next.privateKey) s.connections[id] = next;
  else delete s.connections[id];
  await persist(s);
  return c.json({ ok: true });
});

secrets.delete('/connection/:id', async (c) => {
  const s = await load();
  delete s.connections[c.req.param('id')];
  await persist(s);
  return c.json({ ok: true });
});

secrets.put('/webdav', async (c) => {
  const { pass } = await c.req
    .json<{ pass?: string }>()
    .catch(() => ({ pass: undefined }));
  const s = await load();
  if (pass) s.webdav = { pass };
  else delete s.webdav;
  await persist(s);
  return c.json({ ok: true });
});
