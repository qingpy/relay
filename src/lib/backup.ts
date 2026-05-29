import { db, type RelayDB } from '@/db/db';
import { normalizeConnection } from '@/lib/models';
import type {
  AppConfig,
  Connection,
  Folder,
  Message,
  Prompt,
  Session,
  StoredFile,
} from '@/db/types';

/** Backup file schema version (bump if the shape changes incompatibly). */
const BACKUP_VERSION = 1;

type SerializedFile = Omit<StoredFile, 'blob'> & { blobBase64: string };

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

/** Dump every table — config, chats, connections (incl. keys), files — to JSON.
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

  const serializedFiles: SerializedFile[] = await Promise.all(
    files.map(async ({ blob, ...rest }) => ({
      ...rest,
      blobBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    })),
  );

  return {
    app: 'relay',
    version: BACKUP_VERSION,
    dbVersion: database.verno,
    exportedAt: Date.now(),
    data: {
      connections,
      folders,
      sessions,
      messages,
      prompts,
      appConfig,
      files: serializedFiles,
    },
  };
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
  const files: StoredFile[] = d.files.map(({ blobBase64, ...rest }) => ({
    ...rest,
    blob: base64ToBlob(blobBase64, rest.mimeType),
  }));

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
