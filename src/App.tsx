import { ChatPane } from '@/components/layout/ChatPane';
import { Sidebar } from '@/components/layout/Sidebar';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ConfirmDialog } from '@/components/ui/confirm';
import { useUiStore } from '@/store/ui';

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarOpen && <Sidebar />}
      <ChatPane />
      <SettingsDialog />
      <ConfirmDialog />
    </div>
  );
}
