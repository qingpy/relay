import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Copy, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { CheckSquare } from '@/components/ui/check-square';
import { confirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deleteSession,
  duplicateSession,
  listFolders,
  moveSessionToFolder,
  renameSession,
} from '@/db/repo';
import type { Session } from '@/db/types';
import { formatDateTime, formatStamp } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { InlineEdit } from './InlineEdit';

export function SessionRow({ session }: { session: Session; nested?: boolean }) {
  const activeId = useUiStore((s) => s.activeSessionId);
  const setActive = useUiStore((s) => s.setActiveSession);
  const setActivePreset = useUiStore((s) => s.setActivePreset);
  const folders = useLiveQuery(() => listFolders(), [], []);
  const [editing, setEditing] = useState(false);

  const selecting = useUiStore((s) => s.chatSelectMode);
  const checked = useUiStore((s) => !!s.selectedChats[session.id]);
  const setChatSelected = useUiStore((s) => s.setChatSelected);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `S:${session.id}` });

  const isActive = activeId === session.id;

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete chat?',
      description: `"${session.title}" and its messages will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteSession(session.id);
    if (isActive) setActive(null);
  };

  const onDuplicate = async () => {
    const copy = await duplicateSession(session.id);
    if (copy) setActive(copy.id);
  };

  const onRowClick = () => {
    if (editing) return;
    if (selecting) {
      setChatSelected(session.id, !checked);
    } else {
      setActivePreset(session.folderId);
      setActive(session.id);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(selecting ? {} : attributes)}
      {...(selecting ? {} : listeners)}
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onDoubleClick={() => !selecting && setEditing(true)}
      onKeyDown={(e) => e.key === 'Enter' && onRowClick()}
      className={cn(
        'group flex cursor-pointer items-center justify-between gap-3 py-2.5 pl-12 pr-6 outline-none transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {selecting ? (
          <CheckSquare checked={checked} />
        ) : (
          <span
            className={cn(
              'size-2 shrink-0 border transition-colors',
              isActive
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/40',
            )}
          />
        )}

        {editing ? (
          <InlineEdit
            value={session.title}
            onCommit={(v) => {
              void renameSession(session.id, v);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] transition-colors',
              isActive
                ? 'font-medium text-foreground'
                : 'text-muted-foreground group-hover:text-foreground',
            )}
          >
            {session.title}
          </span>
        )}
      </div>

      {!editing && !selecting && (
        <div className="relative flex shrink-0 items-center justify-end">
          <time
            dateTime={new Date(session.updatedAt).toISOString()}
            title={formatDateTime(session.updatedAt)}
            className="label-mono whitespace-nowrap tabular-nums text-muted-foreground/50 transition-opacity group-hover:opacity-0"
          >
            {formatStamp(session.updatedAt)}
          </time>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onPointerDown={stop}
                onClick={stop}
                aria-label="Chat options"
                className="absolute right-0 flex size-6 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setTimeout(() => setEditing(true), 0)}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onDuplicate()}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              {folders.length > 1 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput />
                    Move to preset
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        disabled={f.id === session.folderId}
                        onSelect={() => void moveSessionToFolder(session.id, f.id)}
                      >
                        {f.id === session.folderId ? (
                          <Check />
                        ) : (
                          <span className="size-4" />
                        )}
                        <span className="min-w-0 truncate">{f.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem destructive onSelect={() => void onDelete()}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
