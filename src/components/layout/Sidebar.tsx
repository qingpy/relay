import { useLiveQuery } from 'dexie-react-hooks';
import {
  MessageSquarePlus,
  PanelLeftClose,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSession, listSessions } from '@/db/repo';
import { startNewSession } from '@/lib/session-actions';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const sessions = useLiveQuery(() => listSessions(), [], []);
  const activeId = useUiStore((s) => s.activeSessionId);
  const setActive = useUiStore((s) => s.setActiveSession);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const onDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
    if (activeId === id) setActive(null);
  };

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

      <div className="px-3 pb-2">
        <Button
          variant="secondary"
          className="w-full justify-start gap-2"
          onClick={() => void startNewSession()}
        >
          <MessageSquarePlus />
          New chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {sessions.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActive(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setActive(s.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
                    activeId === s.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <button
                    type="button"
                    onClick={(e) => void onDelete(e, s.id)}
                    title="Delete chat"
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
