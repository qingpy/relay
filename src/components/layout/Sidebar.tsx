import { Marginalia } from '@/components/ui/marginalia';
import { createFolder } from '@/db/repo';
import { startNewSession } from '@/lib/session-actions';
import { useUiStore } from '@/store/ui';
import { ChatSelectionBar } from '@/components/sidebar/ChatSelectionBar';
import { SessionTree } from '@/components/sidebar/SessionTree';

export function Sidebar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const chatSelectMode = useUiStore((s) => s.chatSelectMode);
  const toggleChatSelectMode = useUiStore((s) => s.toggleChatSelectMode);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-6 text-sidebar-foreground">
      <div className="flex items-center justify-between px-8 pb-6">
        <span className="label-mono text-primary">Relay</span>
        <button
          type="button"
          onClick={toggleSidebar}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="font-mono text-base leading-none text-muted-foreground transition-colors hover:text-foreground"
        >
          ◂
        </button>
      </div>

      <div className="flex items-center gap-3 px-8 pb-8">
        <Marginalia onClick={() => void startNewSession()} title="New chat">
          New chat
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia onClick={() => void createFolder()} title="New preset">
          New preset
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia
          onClick={toggleChatSelectMode}
          active={chatSelectMode}
          title="Select chats"
        >
          Select
        </Marginalia>
      </div>

      {chatSelectMode && <ChatSelectionBar />}

      <nav className="flex-1 overflow-y-auto">
        <SessionTree />
      </nav>
    </aside>
  );
}
