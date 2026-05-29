import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  listFolders,
  listSessions,
  persistFolderOrder,
  persistSessionOrder,
} from '@/db/repo';
import type { Session } from '@/db/types';
import { useUiStore } from '@/store/ui';
import { FolderRow } from './FolderRow';
import { SessionRow } from './SessionRow';

export function SessionTree() {
  const folders = useLiveQuery(() => listFolders(), [], []);
  const sessions = useLiveQuery(() => listSessions(), [], []);
  const collapsed = useUiStore((s) => s.collapsedFolders);

  const [active, setActive] = useState<{ type: 'F' | 'S'; label: string } | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const inFolder = (fid: string) => sessions.filter((s) => s.folderId === fid);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith('F:')) {
      const f = folders.find((x) => `F:${x.id}` === id);
      setActive({ type: 'F', label: f?.name ?? '' });
    } else {
      const s = sessions.find((x) => `S:${x.id}` === id);
      setActive({ type: 'S', label: s?.title ?? '' });
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const aid = String(a.id);
    const oid = String(over.id);
    if (aid === oid) return;

    // Preset reorder.
    if (aid.startsWith('F:')) {
      if (!oid.startsWith('F:')) return;
      const oldI = folders.findIndex((f) => `F:${f.id}` === aid);
      const newI = folders.findIndex((f) => `F:${f.id}` === oid);
      if (oldI < 0 || newI < 0) return;
      const next = arrayMove(folders, oldI, newI);
      void persistFolderOrder(next.map((f, i) => ({ id: f.id, order: i })));
      return;
    }

    // Chat move / reorder — always lands in some preset.
    const sid = aid.slice(2);
    const session = sessions.find((s) => s.id === sid);
    if (!session) return;

    let targetFolderId: string;
    let targetList: Session[];
    let insertIndex: number;

    if (oid.startsWith('F:')) {
      targetFolderId = oid.slice(2);
      targetList = inFolder(targetFolderId);
      insertIndex = targetList.length;
    } else if (oid.startsWith('S:')) {
      const overSession = sessions.find((s) => s.id === oid.slice(2));
      if (!overSession?.folderId) return;
      targetFolderId = overSession.folderId;
      targetList = inFolder(targetFolderId);
      insertIndex = targetList.findIndex((s) => s.id === overSession.id);
      if (insertIndex < 0) insertIndex = targetList.length;
    } else {
      return;
    }

    if (session.folderId === targetFolderId) {
      const oldIndex = targetList.findIndex((s) => s.id === sid);
      if (oldIndex < 0 || oldIndex === insertIndex) return;
      const next = arrayMove(targetList, oldIndex, insertIndex);
      void persistSessionOrder(
        next.map((s, i) => ({ id: s.id, order: i, folderId: targetFolderId })),
      );
    } else {
      const next = [...targetList];
      next.splice(insertIndex, 0, session);
      void persistSessionOrder(
        next.map((s, i) => ({ id: s.id, order: i, folderId: targetFolderId })),
      );
    }
  };

  if (folders.length === 0) {
    return (
      <p className="label-mono px-1 py-8 text-center text-muted-foreground/60">
        No presets yet
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex flex-col gap-6">
        <SortableContext
          items={folders.map((f) => `F:${f.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {folders.map((f) => (
            <div key={f.id} className="flex flex-col">
              <FolderRow
                folder={f}
                count={inFolder(f.id).length}
                topChatId={inFolder(f.id)[0]?.id}
                chatIds={inFolder(f.id).map((s) => s.id)}
              />
              {!collapsed[f.id] && (
                <SortableContext
                  items={inFolder(f.id).map((s) => `S:${s.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col">
                    {inFolder(f.id).map((s) => (
                      <SessionRow key={s.id} session={s} nested />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          ))}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="flex h-8 items-center border border-border bg-popover px-2 text-sm">
            <span className="max-w-48 truncate">{active.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
