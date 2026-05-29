import { db, getAppConfig, updateAppConfig } from '@/db/db';
import { listConnections } from '@/db/repo';
import { flushLocalStore } from '@/lib/localstore';
import type { Connection, WebDavConfig } from '@/db/types';

/**
 * Client side of the secret store (server: `server/secrets.ts`).
 *
 * Credentials (API keys, the Vertex private key, the WebDAV password) live only
 * in a proxy-owned file outside the repo, keyed by connection id — never in the
 * data snapshot, the WebDAV mirror, backups, or the browser's persisted state.
 * This module is the browser's thin client for that store:
 *
 *   - `initSecrets()` runs once on boot: it migrates any keys still embedded in
 *     an older snapshot into the store (stripping them from the file), then
 *     loads the status booleans the UI uses to show "saved" placeholders.
 *   - editors call `putConnectionSecret` / `putWebdavSecret` to set a key, and
 *     `deleteConnectionSecret` when a connection is removed.
 *
 * Secret *values* are write-only from here — they're set, never read back; the
 * proxy injects them into upstream requests itself.
 */

interface SecretStatus {
  /** connection id -> whether a key/private-key is stored for it. */
  connections: Record<string, boolean>;
  /** whether a WebDAV password is stored. */
  webdav: boolean;
}

// Boot-time snapshot of which secrets exist (booleans only). Read synchronously
// by the settings UI; kept in step as the user sets/clears keys.
let status: SecretStatus = { connections: {}, webdav: false };

/** Whether a key is stored for this connection (drives the editor placeholder). */
export function connectionSecretSet(id: string): boolean {
  return !!status.connections[id];
}

/** Whether a WebDAV password is stored. */
export function webdavSecretSet(): boolean {
  return status.webdav;
}

async function fetchStatus(): Promise<SecretStatus> {
  const res = await fetch('/api/secrets/status');
  if (!res.ok) throw new Error(`Secret status failed (${res.status})`);
  return (await res.json()) as SecretStatus;
}

/** Set or clear a connection's secret (empty string clears the field). */
export async function putConnectionSecret(
  id: string,
  patch: { apiKey?: string; privateKey?: string },
): Promise<void> {
  const res = await fetch(`/api/secrets/connection/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Saving the key failed (${res.status})`);
  status.connections[id] = !!(patch.apiKey || patch.privateKey);
}

/** Remove all secrets for a connection (call when the connection is deleted). */
export async function deleteConnectionSecret(id: string): Promise<void> {
  await fetch(`/api/secrets/connection/${id}`, { method: 'DELETE' });
  delete status.connections[id];
}

/** Set or clear the WebDAV password. */
export async function putWebdavSecret(pass: string): Promise<void> {
  const res = await fetch('/api/secrets/webdav', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pass }),
  });
  if (!res.ok) throw new Error(`Saving the password failed (${res.status})`);
  status.webdav = !!pass;
}

/**
 * One-time migration: lift any secrets still embedded in the in-memory DB (an
 * older snapshot loaded keys into connections / the WebDAV config) into the
 * secret store, then delete them from the DB so the next write produces a
 * credential-free file. Idempotent — safe to run on every boot.
 */
async function migrateEmbeddedSecrets(): Promise<void> {
  let changed = false;

  for (const conn of await listConnections()) {
    const legacy = conn as Connection & { apiKey?: string; privateKey?: string };
    const patch: { apiKey?: string; privateKey?: string } = {};
    if (legacy.apiKey) patch.apiKey = legacy.apiKey;
    if (legacy.privateKey) patch.privateKey = legacy.privateKey;
    if (patch.apiKey || patch.privateKey) {
      await putConnectionSecret(conn.id, patch);
      await db.connections.where('id').equals(conn.id).modify((rec) => {
        const r = rec as Connection & { apiKey?: string; privateKey?: string };
        delete r.apiKey;
        delete r.privateKey;
      });
      changed = true;
    }
  }

  const cfg = await getAppConfig();
  const webdav = cfg.webdav as (WebDavConfig & { pass?: string }) | undefined;
  if (webdav?.pass) {
    await putWebdavSecret(webdav.pass);
    const { pass, ...rest } = webdav;
    await updateAppConfig({ webdav: rest });
    changed = true;
  }

  // Persist the stripped snapshot now so the cleanup is durable immediately
  // (rather than waiting for the next user edit).
  if (changed) await flushLocalStore();
}

/** Boot: migrate any embedded secrets, then load the status booleans. */
export async function initSecrets(): Promise<void> {
  await migrateEmbeddedSecrets();
  status = await fetchStatus();
}
