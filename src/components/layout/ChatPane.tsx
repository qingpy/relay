import { MessageSquareText, PanelLeftOpen, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Composer } from '@/components/chat/Composer';
import { ExportMenu } from '@/components/chat/ExportMenu';
import { MessageList } from '@/components/chat/MessageList';
import { ModelSettings } from '@/components/chat/ModelSettings';
import { SessionControls } from '@/components/chat/SessionControls';
import { useUiStore } from '@/store/ui';

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <MessageSquareText className="size-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        Start a conversation
      </h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Type a message below to begin. Your chats stay on this device.
      </p>
    </div>
  );
}

export function ChatPane() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeId = useUiStore((s) => s.activeSessionId);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen />
          </Button>
        )}
        {activeId ? (
          <SessionControls sessionId={activeId} />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">Relay</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {activeId && <ExportMenu sessionId={activeId} />}
          {activeId && <ModelSettings sessionId={activeId} />}
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
      </header>

      {activeId ? <MessageList sessionId={activeId} /> : <EmptyState />}

      <Composer sessionId={activeId} />
    </main>
  );
}
