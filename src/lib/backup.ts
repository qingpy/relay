import { db } from '@/db/db';
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

/** Dump every table — config, chats, connections (incl. keys), files — to JSON. */
export async function exportAll(): Promise<BackupFile> {
  const [connections, folders, sessions, messages, prompts, appConfig, files] =
    await Promise.all([
      db.connections.toArray(),
      db.folders.toArray(),
      db.sessions.toArray(),
      db.messages.toArray(),
      db.prompts.toArray(),
      db.appConfig.toArray(),
      db.files.toArray(),
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
    dbVersion: db.verno,
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

/** Replace the entire local database with a backup's contents. */
export async function importAll(file: BackupFile): Promise<void> {
  if (!isBackupFile(file)) throw new Error('Not a valid Relay backup file.');
  const d = file.data;
  const files: StoredFile[] = d.files.map(({ blobBase64, ...rest }) => ({
    ...rest,
    blob: base64ToBlob(blobBase64, rest.mimeType),
  }));

  await db.transaction(
    'rw',
    [
      db.connections,
      db.folders,
      db.sessions,
      db.messages,
      db.prompts,
      db.files,
      db.appConfig,
    ],
    async () => {
      await Promise.all([
        db.connections.clear(),
        db.folders.clear(),
        db.sessions.clear(),
        db.messages.clear(),
        db.prompts.clear(),
        db.files.clear(),
        db.appConfig.clear(),
      ]);
      await Promise.all([
        db.connections.bulkPut(d.connections ?? []),
        db.folders.bulkPut(d.folders ?? []),
        db.sessions.bulkPut(d.sessions ?? []),
        db.messages.bulkPut(d.messages ?? []),
        db.prompts.bulkPut(d.prompts ?? []),
        db.appConfig.bulkPut(d.appConfig ?? []),
        db.files.bulkPut(files),
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
