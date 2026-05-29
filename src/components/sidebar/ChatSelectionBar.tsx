import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
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

/** Bulk actions shown while selecting chats in the sidebar: move, delete, done. */
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
      description:
        'The selected chats and their messages will be permanently removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) await deleteSession(id);
    if (activeId && ids.includes(activeId)) setActive(null);
    clearChatSelection();
  };

  return (
    <div className="flex items-center gap-3 px-8 pb-4">
      <span
        className="label-mono tabular-nums text-muted-foreground"
        title="Click a preset to select its chats"
      >
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Marginalia
              disabled={!count || folders.length === 0}
              title="Move to preset"
            >
              Move
            </Marginalia>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {folders.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => void move(f.id)}>
                <span className="min-w-0 truncate">{f.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia disabled={!count} onClick={() => void remove()} title="Delete selected">
          Delete
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia onClick={toggleChatSelectMode} title="Done">
          Done
        </Marginalia>
      </div>
    </div>
  );
}
