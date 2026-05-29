import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, HardDriveDownload, RotateCcw, Trash2, Upload } from 'lucide-react';
import { FlatButton } from '@/components/ui/flat-button';
import { confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getAppConfig, updateAppConfig } from '@/db/db';
import { downloadBackup, exportAll, importAll, readBackupFile } from '@/lib/backup';
import {
  deleteServerBackup,
  listServerBackups,
  restoreServerBackup,
  saveBackupToServer,
  type ServerBackup,
} from '@/lib/backupClient';
import { formatDateTime } from '@/lib/time';
import { SectionLabel } from './SectionLabel';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const backup = config?.backup;
  const fileInput = useRef<HTMLInputElement>(null);

  const [list, setList] = useState<ServerBackup[]>([]);
  const [dir, setDir] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await listServerBackups();
      setList(r.backups);
      setDir(r.dir);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2500);
  };

  const downloadNow = async () => {
    downloadBackup(await exportAll());
  };

  const backupToServer = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveBackupToServer();
      flash('Backed up to server.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (file: File) => {
    setError(null);
    try {
      const parsed = await readBackupFile(file);
      const ok = await confirm({
        title: 'Restore from this file?',
        description:
          'This replaces ALL current data (chats, connections, settings) with the backup. The app will reload.',
        confirmLabel: 'Restore',
        destructive: true,
      });
      if (!ok) return;
      await importAll(parsed);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async (name: string) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      description:
        'This replaces ALL current data with the backup. The app will reload.',
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!ok) return;
    try {
      await restoreServerBackup(name);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (name: string) => {
    const ok = await confirm({
      title: 'Delete this backup?',
      description: name,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteServerBackup(name);
    await refresh();
  };

  const patchBackup = (patch: Partial<NonNullable<typeof backup>>) =>
    void updateAppConfig({ backup: { ...backup, ...patch } });

  return (
    <section className="flex flex-col gap-6">
      <SectionLabel>Backup &amp; restore</SectionLabel>

      <div className="flex flex-wrap gap-2">
        <FlatButton onClick={() => void downloadNow()}>
          <Download />
          Download
        </FlatButton>
        <FlatButton onClick={() => fileInput.current?.click()}>
          <Upload />
          Restore from file
        </FlatButton>
        <FlatButton disabled={busy} onClick={() => void backupToServer()}>
          <HardDriveDownload />
          Back up to server
        </FlatButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onImportFile(f);
          }}
        />
      </div>

      {status && <p className="text-xs text-primary">{status}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Automatic server backups
          {backup?.lastBackupAt && (
            <span className="block text-xs text-muted-foreground">
              Last {formatDateTime(backup.lastBackupAt)}
            </span>
          )}
        </span>
        <Switch
          checked={backup?.scheduleEnabled ?? false}
          onCheckedChange={(v) => patchBackup({ scheduleEnabled: v })}
        />
      </label>

      {backup?.scheduleEnabled && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Every</span>
          <span className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="h-8 w-20"
              value={backup.intervalHours ?? 24}
              onChange={(e) =>
                patchBackup({ intervalHours: Number(e.target.value) || 24 })
              }
            />
            <span className="text-muted-foreground">hours</span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            Server backups{list.length ? ` · ${list.length}` : ''}
          </span>
          {dir && (
            <span className="max-w-56 truncate text-[11px] text-muted-foreground" title={dir}>
              {dir}
            </span>
          )}
        </div>
        <div className="flex max-h-48 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {list.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No server backups yet.
            </p>
          )}
          {list.map((b) => (
            <div key={b.name} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs" title={b.name}>
                  {b.name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDateTime(b.mtime)} · {formatBytes(b.size)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void restore(b.name)}
                aria-label="Restore"
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void remove(b.name)}
                aria-label="Delete"
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
