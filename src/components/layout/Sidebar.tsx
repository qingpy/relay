import { FolderPlus, ListChecks, PanelLeftClose, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createFolder } from '@/db/repo';
import { startNewSession } from '@/lib/session-actions';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { ChatSelectionBar } from '@/components/sidebar/ChatSelectionBar';
import { SessionTree } from '@/components/sidebar/SessionTree';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const chatSelectMode = useUiStore((s) => s.chatSelectMode);
  const toggleChatSelectMode = useUiStore((s) => s.toggleChatSelectMode);

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
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleChatSelectMode}
          title="Select chats"
          aria-label="Select chats"
          aria-pressed={chatSelectMode}
          className={cn(
            chatSelectMode &&
              'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
          )}
        >
          <ListChecks />
        </Button>
      </div>

      {chatSelectMode && <ChatSelectionBar />}

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <SessionTree />
      </nav>

      <div className="flex items-center border-t border-sidebar-border px-3 py-2">
        <ThemeToggle />
      </div>
    </aside>
  );
}
