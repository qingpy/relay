import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FlatButton } from '@/components/ui/flat-button';
import { confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getAppConfig } from '@/db/db';
import type { WebDavConfig } from '@/db/types';
import { formatDateTime } from '@/lib/time';
import {
  backupToWebdav,
  getLastSync,
  getSyncMessage,
  restoreFromWebdav,
  saveWebdavConfig,
  syncNow,
  testWebdav,
} from '@/lib/webdav';
import { useUiStore } from '@/store/ui';
import { SectionLabel } from './SectionLabel';

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'label-mono text-muted-foreground';

const BLANK: WebDavConfig = {
  url: '',
  user: '',
  pass: '',
  path: 'relay',
  enabled: false,
  intervalHours: 1,
};

export function WebdavSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const wd = config?.webdav;
  const status = useUiStore((s) => s.syncStatus);

  const [form, setForm] = useState<WebDavConfig>(BLANK);
  const [seeded, setSeeded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wd && !seeded) {
      setForm({ ...BLANK, ...wd });
      setSeeded(true);
    }
  }, [wd, seeded]);

  const set = (patch: Partial<WebDavConfig>) =>
    setForm((f) => ({ ...f, ...patch }));

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 3000);
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    const r = await testWebdav(form);
    setBusy(false);
    flash(r.ok ? 'Connection OK.' : `Failed: ${r.error}`);
  };

  const save = async () => {
    await saveWebdavConfig(form);
    flash('Saved.');
  };

  const run = async (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg) {
      const ok = await confirm({
        title: confirmMsg,
        confirmLabel: 'Continue',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await fn();
    } catch {
      /* status reflects the error */
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
            value={form.pass}
            onChange={(e) => set({ pass: e.target.value })}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={FIELD}>
          <span className={LABEL}>Folder</span>
          <Input
            value={form.path}
            onChange={(e) => set({ path: e.target.value })}
            placeholder="relay"
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Every (hours)</span>
          <Input
            type="number"
            min={1}
            value={form.intervalHours ?? 1}
            onChange={(e) => set({ intervalHours: Number(e.target.value) || 1 })}
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Enable sync</span>
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <FlatButton onClick={() => void test()} disabled={busy || !form.url}>
          Test
        </FlatButton>
        <FlatButton onClick={() => void save()} disabled={busy}>
          Save
        </FlatButton>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span
          className={
            status === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
          }
        >
          {note ?? statusText}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <FlatButton onClick={() => void run(syncNow)} disabled={busy || !wd?.enabled}>
          Sync now
        </FlatButton>
        <FlatButton
          onClick={() => void run(backupToWebdav, 'Overwrite the server copy with this device?')}
          disabled={busy || !wd?.enabled}
        >
          Back up to WebDAV
        </FlatButton>
        <FlatButton
          onClick={() =>
            void run(restoreFromWebdav, 'Replace ALL data on this device with the server copy?')
          }
          disabled={busy || !wd?.enabled}
        >
          Restore from WebDAV
        </FlatButton>
      </div>
    </section>
  );
}
