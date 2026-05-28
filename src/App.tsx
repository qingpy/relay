import { useEffect } from 'react';
import { ChatPane } from '@/components/layout/ChatPane';
import { Sidebar } from '@/components/layout/Sidebar';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ensureDefaultConnection } from '@/db/db';
import { useUiStore } from '@/store/ui';

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // Guarantee a connection exists on first run so chats have a model to use.
  useEffect(() => {
    void ensureDefaultConnection();
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarOpen && <Sidebar />}
      <ChatPane />
      <SettingsDialog />
      <ConfirmDialog />
    </div>
  );
}
