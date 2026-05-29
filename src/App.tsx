import { lazy, Suspense, useEffect } from 'react';
import { ChatPane } from '@/components/layout/ChatPane';
import { Sidebar } from '@/components/layout/Sidebar';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ensureDefaultPreset } from '@/db/repo';
import { maybeRunScheduledBackup } from '@/lib/backupClient';
import { useUiStore } from '@/store/ui';

// Settings (with its connection/backup/prompt managers) loads on first open.
const SettingsDialog = lazy(() =>
  import('@/components/settings/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  })),
);

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);

  // Guarantee a connection and a preset exist (chats always live in a preset).
  useEffect(() => {
    void ensureDefaultPreset();
  }, []);

  // Run scheduled local backups while the app is open.
  useEffect(() => {
    void maybeRunScheduledBackup();
    const id = setInterval(() => void maybeRunScheduledBackup(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarOpen && <Sidebar />}
      <ChatPane />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
      <ConfirmDialog />
    </div>
  );
}
