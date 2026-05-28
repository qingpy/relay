import { MessageSquarePlus, PanelLeftClose, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/ui';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Header */}
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

      {/* New chat */}
      <div className="px-3 pb-2">
        <Button variant="secondary" className="w-full justify-start gap-2" disabled>
          <MessageSquarePlus />
          New chat
        </Button>
      </div>

      {/* Session / folder tree (built in M2) */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-1 py-8 text-center text-xs text-muted-foreground">
          No conversations yet.
        </p>
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          title="Settings"
          aria-label="Settings"
        >
          <Settings />
        </Button>
      </div>
    </aside>
  );
}
