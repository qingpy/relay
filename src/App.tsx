import { Sidebar } from '@/components/layout/Sidebar';
import { ChatPane } from '@/components/layout/ChatPane';
import { useUiStore } from '@/store/ui';

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarOpen && <Sidebar />}
      <ChatPane />
    </div>
  );
}
