import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { confirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteFolder, renameFolder } from '@/db/repo';
import type { Folder } from '@/db/types';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { InlineEdit } from './InlineEdit';

export function FolderRow({
  folder,
  count,
  topChatId,
  chatIds = [],
}: {
  folder: Folder;
  count: number;
  topChatId?: string;
  chatIds?: string[];
}) {
  const collapsed = useUiStore((s) => !!s.collapsedFolders[folder.id]);
  const toggleFolder = useUiStore((s) => s.toggleFolder);
  const setActivePreset = useUiStore((s) => s.setActivePreset);
  const setActive = useUiStore((s) => s.setActiveSession);
  const isActivePreset = useUiStore((s) => s.activePresetId === folder.id);
  const selecting = useUiStore((s) => s.chatSelectMode);
  const selectedChats = useUiStore((s) => s.selectedChats);
  const setChatSelected = useUiStore((s) => s.setChatSelected);
  const [editing, setEditing] = useState(false);

  const allSelected = chatIds.length > 0 && chatIds.every((id) => selectedChats[id]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id: `F:${folder.id}` });

  // Highlight as a drop target only when a session (not another folder) hovers.
  const sessionOver = isOver && String(active?.id ?? '').startsWith('S:');

  // While selecting: click a preset to (de)select all of its chats. Otherwise:
  // make it active, expand it, and jump to its top chat — or a blank chat bound
  // to the preset when it has none.
  const onActivate = () => {
    if (editing) return;
    if (selecting) {
      for (const id of chatIds) setChatSelected(id, !allSelected);
      return;
    }
    setActivePreset(folder.id);
    if (collapsed) toggleFolder(folder.id);
    // No chat under it → blank chat bound to this preset, not the last one viewed.
    setActive(topChatId ?? null);
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete preset?',
      description:
        count > 0
          ? `"${folder.name}" will be deleted. Its ${count} chat(s) move to another preset.`
          : `"${folder.name}" will be deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await deleteFolder(folder.id);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => e.key === 'Enter' && onActivate()}
      className={cn(
        'group flex cursor-pointer items-center gap-2 px-8 pb-3 pt-1 outline-none transition-colors',
        isDragging && 'opacity-50',
        sessionOver && 'bg-primary/10',
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand preset' : 'Collapse preset'}
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          toggleFolder(folder.id);
        }}
        className="flex w-3 shrink-0 justify-center font-mono text-[0.7rem] text-muted-foreground/60 hover:text-foreground"
      >
        {collapsed ? '▸' : '▾'}
      </button>

      {editing ? (
        <InlineEdit
          value={folder.name}
          onCommit={(v) => {
            void renameFolder(folder.id, v);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span
            className={cn(
              'label-mono min-w-0 flex-1 truncate transition-colors',
              isActivePreset
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground',
            )}
          >
            {folder.name}
          </span>
          <span className="label-mono shrink-0 tabular-nums text-muted-foreground/40 group-hover:hidden">
            {count || ''}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onPointerDown={stop}
                onClick={stop}
                aria-label="Preset options"
                className="hidden size-6 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground focus-visible:opacity-100 group-hover:flex data-[state=open]:flex"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setTimeout(() => setEditing(true), 0)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => void onDelete()}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
