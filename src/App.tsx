import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChatPane } from '@/components/layout/ChatPane';
import { KeyboardShortcuts } from '@/components/layout/KeyboardShortcuts';
import { Sidebar } from '@/components/layout/Sidebar';
import { TrashDialog } from '@/components/sidebar/TrashDialog';
import { ConfirmDialog } from '@/components/ui/confirm';
import { APP_CONFIG_ID, db } from '@/db/db';
import { ensureDefaultPreset, purgeExpiredTrash } from '@/db/repo';
import { maybeRunScheduledBackup } from '@/lib/backupClient';
import { initLocalStore } from '@/lib/localstore';
import { initSecrets } from '@/lib/secrets';
import {
  initWebdavSync,
  maybeRunScheduledWebdavBackup,
  maybeRunScheduledWebdavSync,
} from '@/lib/webdav';
import { useUiStore } from '@/store/ui';

// Settings (with its connection/backup/prompt managers) loads on first open.
const SettingsDialog = lazy(() =>
  import('@/components/settings/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  })),
);

type Boot = { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string };

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const started = useRef(false);

  // Boot: load the data file into the in-memory store (off C:), move any
  // embedded secrets into the proxy's secret store, seed defaults, then start
  // WebDAV sync. The app doesn't render until the store is loaded — no flash of
  // empty state, and no write-through before the load.
  const start = () => {
    setBoot({ phase: 'loading' });
    void (async () => {
      try {
        await initLocalStore();
        await initSecrets();
        await ensureDefaultPreset();
        await purgeExpiredTrash();
        await initWebdavSync();
        setBoot({ phase: 'ready' });
      } catch (e) {
        setBoot({
          phase: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  };

  useEffect(() => {
    if (started.current) return; // run once (StrictMode-safe)
    started.current = true;
    start();
  }, []);

  // Code-block line wrapping is a global preference, applied once as a root
  // class so every rendered block follows it without per-block state. This reads
  // the config table directly (not getAppConfig, which *writes* a default when
  // absent) so it stays a safe read-only observer even before the store hydrates.
  const wrapCode = useLiveQuery(
    () => db.appConfig.get(APP_CONFIG_ID).then((c) => c?.wrapCodeBlocks ?? true),
    [],
  );
  useEffect(() => {
    document.documentElement.classList.toggle('code-nowrap', wrapCode === false);
  }, [wrapCode]);

  // Background work while the app is open: local backups + WebDAV sync. Each
  // call no-ops until its own interval is due, so a 1-min tick is cheap.
  useEffect(() => {
    if (boot.phase !== 'ready') return;
    void maybeRunScheduledBackup();
    const id = setInterval(() => {
      void maybeRunScheduledBackup();
      void maybeRunScheduledWebdavSync();
      void maybeRunScheduledWebdavBackup();
    }, 60_000);
    return () => clearInterval(id);
  }, [boot.phase]);

  if (boot.phase !== 'ready') {
    return <BootScreen boot={boot} onRetry={start} />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarOpen && <Sidebar />}
      {/* Narrow screens: the sidebar overlays the chat, so dim + dismiss it. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
        />
      )}
      <ChatPane />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
      <TrashDialog />
      <ConfirmDialog />
      <KeyboardShortcuts />
    </div>
  );
}

/** Loading / proxy-unreachable screen shown before the data store is ready. */
function BootScreen({ boot, onRetry }: { boot: Boot; onRetry: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="label-mono text-muted-foreground">Relay</span>
        {boot.phase === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading your data…</p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              Can’t reach the local data service.
            </p>
            <p className="text-xs text-muted-foreground">
              Relay stores your data in a file owned by its proxy. Start it with{' '}
              <code className="font-mono">npm run dev</code> (or{' '}
              <code className="font-mono">npm run serve</code>), then retry.
            </p>
            <p className="font-mono text-[11px] text-destructive">
              {(boot as { message: string }).message}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="border border-input bg-card px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.05em] text-foreground transition-colors hover:border-foreground hover:text-primary"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
