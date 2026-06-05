import { db, type RelayDB } from '@/db/db';
import { sha256Hex } from '@/lib/attachments';
import { normalizeConnection } from '@/lib/models';
import type {
  AppConfig,
  Connection,
  Folder,
  Message,
  Prompt,
  Session,
  StoredFile,
  WebDavConfig,
} from '@/db/types';

/** Backup file schema version (bump if the shape changes incompatibly).
 *  v2: file bytes live once per unique content in `data.blobs` (keyed by
 *  SHA-256); rows reference them by `hash`. v1 rows (inline `blobBase64`)
 *  are still imported, gaining a hash on the way in. */
const BACKUP_VERSION = 2;

type SerializedFile = Omit<StoredFile, 'blob'> & { blobBase64?: string };

export interface BackupFile {
  app: 'relay';
  version: number;
  /** Dexie schema version at export time (for reference). */
  dbVersion: number;
  exportedAt: number;
  data: {
    connections: Connection[];
    folders: Folder[];
    sessions: Session[];
    messages: Message[];
    prompts: Prompt[];
    appConfig: AppConfig[];
    files: SerializedFile[];
    /** Content pool: base64 by SHA-256 — each unique attachment stored once. */
    blobs?: Record<string, string>;
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Base64 per content hash, computed once — stored files are immutable, and
 *  re-encoding megabytes on every 400 ms flush would make saves stutter. */
const b64Cache = new Map<string, string>();

async function cachedBase64(hash: string, blob: Blob): Promise<string> {
  let b64 = b64Cache.get(hash);
  if (!b64) {
    b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    b64Cache.set(hash, b64);
  }
  return b64;
}

/** Dump every table — config, chats, connections, files — to JSON. Secrets are
 *  stripped here so the snapshot (the data file, a backup, the WebDAV mirror) is
 *  always credential-free; the proxy's secret store is their only durable home.
 *  Defaults to the app DB; pass another (e.g. the persistent store during M9
 *  migration) to dump it instead. */
export async function exportAll(database: RelayDB = db): Promise<BackupFile> {
  const [connections, folders, sessions, messages, prompts, appConfig, files] =
    await Promise.all([
      database.connections.toArray(),
      database.folders.toArray(),
      database.sessions.toArray(),
      database.messages.toArray(),
      database.prompts.toArray(),
      database.appConfig.toArray(),
      database.files.toArray(),
    ]);

  // Each unique content serializes once into the pool; rows carry the hash.
  // Rows without a hash (not yet through an import backfill) stay inline.
  const blobs: Record<string, string> = {};
  const serializedFiles: SerializedFile[] = [];
  for (const { blob, ...rest } of files) {
    if (rest.hash) {
      blobs[rest.hash] ??= await cachedBase64(rest.hash, blob);
      serializedFiles.push(rest);
    } else {
      serializedFiles.push({
        ...rest,
        blobBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      });
    }
  }

  return {
    app: 'relay',
    version: BACKUP_VERSION,
    dbVersion: database.verno,
    exportedAt: Date.now(),
    data: {
      connections: connections.map(stripConnectionSecrets),
      folders,
      sessions,
      messages,
      prompts,
      appConfig: appConfig.map(stripConfigSecrets),
      files: serializedFiles,
      ...(Object.keys(blobs).length ? { blobs } : {}),
    },
  };
}

/** Drop any secret material from a connection (legacy records may still carry
 *  it before the one-time migration runs). */
function stripConnectionSecrets(conn: Connection): Connection {
  const { apiKey, privateKey, ...rest } = conn as Connection & {
    apiKey?: string;
    privateKey?: string;
  };
  return rest;
}

/** Drop the WebDAV password from the app config snapshot. */
function stripConfigSecrets(config: AppConfig): AppConfig {
  if (!config.webdav) return config;
  const { pass, ...webdav } = config.webdav as WebDavConfig & { pass?: string };
  return { ...config, webdav };
}

/** Validate a parsed object as a Relay backup. */
export function isBackupFile(x: unknown): x is BackupFile {
  return (
    !!x &&
    typeof x === 'object' &&
    (x as BackupFile).app === 'relay' &&
    !!(x as BackupFile).data &&
    Array.isArray((x as BackupFile).data.sessions)
  );
}

/** Replace the entire database with a backup's contents (defaults to the app DB). */
export async function importAll(
  file: BackupFile,
  database: RelayDB = db,
): Promise<void> {
  if (!isBackupFile(file)) throw new Error('Not a valid Relay backup file.');
  const d = file.data;
  // One Blob per unique content, shared by every row that references it.
  // v1 rows (inline base64) get their hash computed here, so dedupe and the
  // pooled v2 format apply from the next save onward.
  const blobPool = new Map<string, Blob>();
  const files: StoredFile[] = await Promise.all(
    (d.files ?? []).map(async ({ blobBase64, ...rest }) => {
      const inline =
        blobBase64 ?? (rest.hash ? (d.blobs?.[rest.hash] ?? '') : '');
      const hash =
        rest.hash ??
        (await sha256Hex(await base64ToBlob(inline, rest.mimeType).arrayBuffer()));
      let blob = blobPool.get(hash);
      if (!blob) {
        blob = base64ToBlob(inline, rest.mimeType);
        blobPool.set(hash, blob);
      }
      return { ...rest, hash, blob };
    }),
  );

  await database.transaction(
    'rw',
    [
      database.connections,
      database.folders,
      database.sessions,
      database.messages,
      database.prompts,
      database.files,
      database.appConfig,
    ],
    async () => {
      await Promise.all([
        database.connections.clear(),
        database.folders.clear(),
        database.sessions.clear(),
        database.messages.clear(),
        database.prompts.clear(),
        database.files.clear(),
        database.appConfig.clear(),
      ]);
      await Promise.all([
        database.connections.bulkPut((d.connections ?? []).map(normalizeConnection)),
        database.folders.bulkPut(d.folders ?? []),
        database.sessions.bulkPut(d.sessions ?? []),
        database.messages.bulkPut(d.messages ?? []),
        database.prompts.bulkPut(d.prompts ?? []),
        database.appConfig.bulkPut(d.appConfig ?? []),
        database.files.bulkPut(files),
      ]);
    },
  );
}

export function backupFilename(label?: string): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
    `-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  return `relay-backup-${stamp}${label ? `-${label}` : ''}.json`;
}

/** Trigger a client-side download of a backup file. */
export function downloadBackup(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  a.click();
  URL.revokeObjectURL(url);
}

/** Read + parse a user-selected backup file. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  const parsed = JSON.parse(await file.text());
  if (!isBackupFile(parsed)) throw new Error('Not a valid Relay backup file.');
  return parsed;
}
