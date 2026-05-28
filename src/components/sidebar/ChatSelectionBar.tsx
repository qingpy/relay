import { useLiveQuery } from 'dexie-react-hooks';
import { FolderInput, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deleteSession,
  listFolders,
  listSessions,
  moveSessionToFolder,
} from '@/db/repo';
import { useUiStore } from '@/store/ui';

/** Toolbar shown while selecting chats in the sidebar: move, delete, done. */
export function ChatSelectionBar() {
  const sessions = useLiveQuery(() => listSessions(), [], []);
  const folders = useLiveQuery(() => listFolders(), [], []);
  const selected = useUiStore((s) => s.selectedChats);
  const clearChatSelection = useUiStore((s) => s.clearChatSelection);
  const toggleChatSelectMode = useUiStore((s) => s.toggleChatSelectMode);
  const activeId = useUiStore((s) => s.activeSessionId);
  const setActive = useUiStore((s) => s.setActiveSession);

  const ids = sessions.filter((s) => selected[s.id]).map((s) => s.id);
  const count = ids.length;

  const move = async (folderId: string) => {
    for (const id of ids) await moveSessionToFolder(id, folderId);
    clearChatSelection();
  };

  const remove = async () => {
    if (!count) return;
    const ok = await confirm({
      title: `Delete ${count} chat${count > 1 ? 's' : ''}?`,
      description: 'The selected chats and their messages will be permanently removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) await deleteSession(id);
    if (activeId && ids.includes(activeId)) setActive(null);
    clearChatSelection();
  };

  return (
    <div className="flex items-center gap-1 border-b border-sidebar-border px-2 py-1.5 text-sm">
      <span className="tabular-nums text-muted-foreground" title="Click a preset to select its chats">
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!count || folders.length === 0}
              title="Move to preset"
            >
              <FolderInput />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {folders.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => void move(f.id)}>
                <span className="min-w-0 truncate">{f.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!count}
          onClick={() => void remove()}
          title="Delete selected"
        >
          <Trash2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={toggleChatSelectMode} title="Done">
          <X />
        </Button>
      </div>
    </div>
  );
}
