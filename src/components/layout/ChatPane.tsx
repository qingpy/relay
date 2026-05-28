import { ArrowUp, MessageSquareText, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/ui';

export function ChatPane() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-14 items-center gap-2 px-4">
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
        <span className="truncate text-sm font-medium text-muted-foreground">
          Relay
        </span>
      </header>

      {/* Empty state (replaced by the message list in M1) */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <MessageSquareText className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Start a conversation
        </h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pick a provider and model, then send a message. Your chats stay on this
          device.
        </p>
      </div>

      {/* Composer placeholder (wired up in M1) */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2 shadow-sm">
          <textarea
            rows={1}
            disabled
            placeholder="Message Relay…"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <Button size="icon" disabled title="Send" aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Streaming chat lands in the next milestone.
        </p>
      </div>
    </main>
  );
}
