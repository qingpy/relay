import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Settings2,
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
import { startNewSession } from '@/lib/session-actions';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { InlineEdit } from './InlineEdit';
import { PresetEditor } from './PresetEditor';

export function FolderRow({ folder, count }: { folder: Folder; count: number }) {
  const collapsed = useUiStore((s) => !!s.collapsedFolders[folder.id]);
  const toggleFolder = useUiStore((s) => s.toggleFolder);
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState(false);

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

  const onNewChat = async () => {
    if (collapsed) toggleFolder(folder.id);
    await startNewSession(folder.id);
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
      onClick={() => !editing && toggleFolder(folder.id)}
      onKeyDown={(e) => e.key === 'Enter' && !editing && toggleFolder(folder.id)}
      className={cn(
        'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none transition-colors',
        isDragging && 'opacity-50',
        sessionOver
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
          : 'text-foreground/90 hover:bg-sidebar-accent/60',
      )}
    >
      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 text-muted-foreground transition-transform',
          !collapsed && 'rotate-90',
        )}
      />
      {collapsed ? (
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
            <DropdownMenuItem onSelect={() => void onNewChat()}>
              <MessageSquarePlus />
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => setConfiguring(true), 0)}>
              <Settings2 />
              Preset settings
            </DropdownMenuItem>
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

      {configuring && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PresetEditor
            folder={folder}
            open={configuring}
            onOpenChange={setConfiguring}
          />
        </div>
      )}
    </div>
  );
}
