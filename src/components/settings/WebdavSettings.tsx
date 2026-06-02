import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { FlatButton } from '@/components/ui/flat-button';
import { confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { getAppConfig } from '@/db/db';
import type { WebDavConfig } from '@/db/types';
import { putWebdavSecret, webdavSecretSet } from '@/lib/secrets';
import { formatDateTime } from '@/lib/time';
import {
  backupNowToWebdav,
  deleteWebdavBackup,
  getLastSync,
  getSyncMessage,
  isSyncConflict,
  listWebdavBackups,
  persistWebdavConfig,
  resolveKeepLocal,
  resolveKeepServer,
  restoreWebdavBackup,
  saveWebdavConfig,
  syncNow,
  testWebdav,
  type WebdavBackup,
} from '@/lib/webdav';
import { useUiStore } from '@/store/ui';
import { SectionLabel } from './SectionLabel';

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'label-mono text-muted-foreground';

const BLANK: WebDavConfig = {
  url: '',
  user: '',
  path: 'relay',
  enabled: false,
  intervalHours: 1,
};

function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function WebdavSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const wd = config?.webdav;
  const status = useUiStore((s) => s.syncStatus);

  const [form, setForm] = useState<WebDavConfig>(BLANK);
  // The password isn't in the config — it's held transiently here and saved to
  // the proxy's secret store. Blank means "keep the stored one".
  const [pass, setPass] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<WebdavBackup[]>([]);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    if (wd && !seeded) {
      setForm({ ...BLANK, ...wd });
      setSeeded(true);
    }
  }, [wd, seeded]);

  const refreshBackups = async () => {
    try {
      setBackups(await listWebdavBackups());
    } catch {
      setBackups([]);
    }
  };

  // Auto-save each field as it changes (like Connections) — never lose settings
  // to a forgotten "Save". Persist-only; syncing is triggered by the toggle.
  const set = (patch: Partial<WebDavConfig>) => {
    setForm((f) => ({ ...f, ...patch }));
    void persistWebdavConfig(patch);
  };

  const setPassword = (value: string) => {
    setPass(value);
    void putWebdavSecret(value); // empty clears the stored password
  };

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 3000);
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    const r = await testWebdav(form, pass);
    setBusy(false);
    flash(r.ok ? 'Connection OK.' : `Failed: ${r.error}`);
  };

  // The toggle is the "activate" action: persist it and (if fully configured)
  // run the first sync. Ensure a just-typed password has reached the store first.
  const toggleEnabled = async (enabled: boolean) => {
    setForm((f) => ({ ...f, enabled }));
    if (enabled && pass) await putWebdavSecret(pass);
    await saveWebdavConfig({ enabled });
  };

  // "Backup" = push the current state to the server and leave a restore point.
  const backup = async () => {
    setBusy(true);
    setNote(null);
    try {
      await syncNow();
      await backupNowToWebdav();
      await refreshBackups();
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (name: string) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      description:
        'This replaces ALL current data with the backup. The app will reload.',
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!ok) return;
    try {
      await restoreWebdavBackup(name);
      location.reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
  };

  const removeBackup = async (name: string) => {
    const ok = await confirm({
      title: 'Delete this backup?',
      description: name,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteWebdavBackup(name);
    await refreshBackups();
  };

  // Resolve a paused conflict (both sides have data, this origin never synced):
  // pick a winner explicitly. "This device" pushes local up; "server" pulls down.
  const keepLocal = async () => {
    const ok = await confirm({
      title: 'Keep this device?',
      description:
        'Your data on this device overwrites the server copy, and sync resumes.',
      confirmLabel: 'Keep this device',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resolveKeepLocal();
    } finally {
      setBusy(false);
    }
  };

  const keepServer = async () => {
    const ok = await confirm({
      title: 'Keep server copy?',
      description:
        'The server copy replaces ALL data on this device. The app will reload.',
      confirmLabel: 'Keep server',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (await resolveKeepServer()) location.reload();
    } finally {
      setBusy(false);
    }
  };

  const last = getLastSync();
  const statusText =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'synced'
        ? `Synced${last ? ` · ${formatDateTime(last)}` : ''}`
        : status === 'error'
          ? `Error: ${getSyncMessage()}`
          : 'Not syncing';

  return (
    <section className="flex flex-col gap-6">
      <SectionLabel>WebDAV sync</SectionLabel>

      <div className={FIELD}>
        <span className={LABEL}>Server URL</span>
        <Input
          value={form.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://dav.example.com/remote.php/dav/files/me/"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={FIELD}>
          <span className={LABEL}>Username</span>
          <Input
            value={form.user}
            onChange={(e) => set({ user: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Password</span>
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPassword(e.target.value)}
            // The real password lives server-side; show dots to signal it's set.
            placeholder={webdavSecretSet() ? '••••••••••' : ''}
            title={webdavSecretSet() ? 'A password is saved — type to replace it' : undefined}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Compact controls — narrow inputs so a single number isn't a half-row. */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className={FIELD}>
          <span className={LABEL}>Folder</span>
          <Input
            className="h-8 w-32"
            value={form.path}
            onChange={(e) => set({ path: e.target.value })}
            placeholder="relay"
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Every (h)</span>
          <Input
            type="number"
            min={1}
            className="h-8 w-20"
            value={form.intervalHours ?? 1}
            onChange={(e) => set({ intervalHours: Number(e.target.value) || 1 })}
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Keep</span>
          <Input
            type="number"
            min={0}
            className="h-8 w-20"
            value={form.backupsKeep ?? 10}
            onChange={(e) =>
              set({ backupsKeep: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Enable sync</span>
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => void toggleEnabled(v)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <FlatButton onClick={() => void test()} disabled={busy || !form.url}>
          Test
        </FlatButton>
        <FlatButton onClick={() => void backup()} disabled={busy || !wd?.enabled}>
          Backup
        </FlatButton>
        <Popover
          open={restoreOpen}
          onOpenChange={(o) => {
            setRestoreOpen(o);
            if (o) void refreshBackups();
          }}
        >
          <PopoverTrigger asChild>
            <FlatButton disabled={busy || !wd?.enabled}>Restore</FlatButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className={`${LABEL} border-b border-border px-3 py-2`}>
              Restore a backup
            </div>
            <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
              {backups.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  No backups yet.
                </p>
              )}
              {backups.map((b) => (
                <div key={b.name} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void restoreBackup(b.name)}
                    className="min-w-0 flex-1 text-left transition-colors hover:text-primary"
                    title={b.name}
                  >
                    <div className="text-xs">{formatDateTime(b.mtime)}</div>
                    {b.size > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        {formatBytes(b.size)}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeBackup(b.name)}
                    aria-label="Delete"
                    className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <span
        className={
          status === 'error'
            ? 'text-xs text-destructive'
            : 'text-xs text-muted-foreground'
        }
      >
        {note ?? statusText}
      </span>

      {status === 'error' && isSyncConflict() && (
        <div className="flex flex-wrap items-center gap-2">
          <FlatButton
            onClick={() => void keepLocal()}
            disabled={busy}
            className="px-2.5 py-1.5"
          >
            Keep this device
          </FlatButton>
          <FlatButton
            onClick={() => void keepServer()}
            disabled={busy}
            className="px-2.5 py-1.5"
          >
            Keep server
          </FlatButton>
        </div>
      )}
    </section>
  );
}
