import { FolderPlus, PanelLeftClose, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createFolder } from '@/db/repo';
import { startNewSession } from '@/lib/session-actions';
import { useUiStore } from '@/store/ui';
import { SessionTree } from '@/components/sidebar/SessionTree';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between px-3">
        <div className="flex items-center gap-2 px-1">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            R
          </span>
          <span className="text-sm font-semibold tracking-tight">Relay</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2">
        <Button
          variant="secondary"
          className="flex-1 justify-start gap-2"
          onClick={() => void startNewSession()}
        >
          <Plus />
          New chat
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => void createFolder()}
          title="New preset"
          aria-label="New preset"
        >
          <FolderPlus />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <SessionTree />
      </nav>

      <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <Settings />
        </Button>
      </div>
    </aside>
  );
}
