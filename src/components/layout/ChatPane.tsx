import { Marginalia } from '@/components/ui/marginalia';
import { Composer } from '@/components/chat/Composer';
import { ContextMeter } from '@/components/chat/ContextMeter';
import { ExportMenu } from '@/components/chat/ExportMenu';
import { MessageList } from '@/components/chat/MessageList';
import { SessionControls } from '@/components/chat/SessionControls';
import { TreeMap } from '@/components/chat/TreeMap';
import { useUiStore } from '@/store/ui';

export function ChatPane() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeId = useUiStore((s) => s.activeSessionId);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const toggleSelectionMode = useUiStore((s) => s.toggleSelectionMode);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Open sidebar"
            aria-label="Open sidebar"
            className="font-mono text-base leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ▸
          </button>
        )}
        {activeId ? (
          <SessionControls sessionId={activeId} />
        ) : (
          <span className="label-mono text-muted-foreground">Relay</span>
        )}
        <div className="ml-auto flex items-center gap-4">
          {activeId && <ContextMeter sessionId={activeId} />}
          {activeId && (
            <Marginalia
              onClick={toggleSelectionMode}
              active={selectionMode}
              title="Select messages"
            >
              Select
            </Marginalia>
          )}
          {activeId && <TreeMap sessionId={activeId} />}
          {activeId && <ExportMenu sessionId={activeId} />}
          <Marginalia
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            Keys
          </Marginalia>
          <Marginalia onClick={() => setSettingsOpen(true)} title="Settings">
            Settings
          </Marginalia>
        </div>
      </header>

      {activeId ? <MessageList sessionId={activeId} /> : <div className="flex-1" />}

      <Composer sessionId={activeId} />
    </main>
  );
}
