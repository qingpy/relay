import { getAppConfig, updateAppConfig } from '@/db/db';
import { exportForBackup, importAll, type BackupFile } from './backup';

export interface ServerBackup {
  name: string;
  size: number;
  mtime: number;
}

/** Dump the local DB and write it to the server's backup directory. */
export async function saveBackupToServer(label?: string): Promise<string> {
  const data = await exportForBackup();
  const qs = label ? `?label=${encodeURIComponent(label)}` : '';
  const res = await fetch(`/api/backup${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Backup failed (${res.status})`);
  }
  return ((await res.json()) as { name: string }).name;
}

export async function listServerBackups(): Promise<{
  dir: string;
  backups: ServerBackup[];
}> {
  const res = await fetch('/api/backup');
  if (!res.ok) throw new Error(`Couldn't list backups (${res.status})`);
  return res.json();
}

export async function restoreServerBackup(name: string): Promise<void> {
  const res = await fetch(`/api/backup/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Couldn't read backup (${res.status})`);
  await importAll((await res.json()) as BackupFile);
}

export async function deleteServerBackup(name: string): Promise<void> {
  const res = await fetch(`/api/backup/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Couldn't delete backup (${res.status})`);
}

let running = false;

/** If a scheduled backup is due, write one and record the time. */
export async function maybeRunScheduledBackup(): Promise<void> {
  if (running) return;
  const cfg = await getAppConfig();
  const b = cfg.backup;
  if (!b?.scheduleEnabled) return;
  const intervalMs = Math.max(1, b.intervalHours ?? 24) * 3_600_000;
  if (Date.now() - (b.lastBackupAt ?? 0) < intervalMs) return;
  running = true;
  try {
    await saveBackupToServer('auto');
    await updateAppConfig({ backup: { ...b, lastBackupAt: Date.now() } });
  } catch {
    // Best-effort; retry on the next tick.
  } finally {
    running = false;
  }
}
