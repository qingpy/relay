import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  Minus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { confirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const someSelected = chatIds.some((id) => selectedChats[id]);

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
  // make it active and jump to its top chat (expanding it).
  const onActivate = () => {
    if (editing) return;
    if (selecting) {
      for (const id of chatIds) setChatSelected(id, !allSelected);
      return;
    }
    setActivePreset(folder.id);
    if (collapsed) toggleFolder(folder.id);
    if (topChatId) setActive(topChatId);
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete preset?',
      description:
        count > 0
          ? `"${folder.name}" will be deleted. Its ${count} chat(s) move to the top level.`
          : `"${folder.name}" will be deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await deleteFolder(folder.id);
  };

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
        'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none transition-colors',
        isDragging && 'opacity-50',
        sessionOver
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
          : !selecting && isActivePreset
            ? 'bg-sidebar-accent/70 text-foreground'
            : 'text-foreground/90 hover:bg-sidebar-accent/60',
      )}
    >
      <button
        type="button"
        title={collapsed ? 'Expand' : 'Collapse'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggleFolder(folder.id);
        }}
        className="-ml-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
        />
      </button>
      {selecting ? (
        <span
          title="Select all chats in this preset"
          className={cn(
            'flex size-3.5 shrink-0 items-center justify-center rounded border',
            allSelected || someSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input',
          )}
        >
          {allSelected ? (
            <Check className="size-2.5" />
          ) : someSelected ? (
            <Minus className="size-2.5" />
          ) : null}
        </span>
      ) : collapsed ? (
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
      )}
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
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70 group-hover:hidden">
            {count || ''}
          </span>
        </>
      )}

      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title="Preset options"
              className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:flex data-[state=open]:flex"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTimeout(() => setEditing(true), 0)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void onDelete()}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
