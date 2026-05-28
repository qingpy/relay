import { type ReactNode, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
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
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { FolderRow } from './FolderRow';
import { SessionRow } from './SessionRow';

const ROOT = 'ROOT';

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

  const rootSessions = sessions.filter((s) => !s.folderId);
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

    // Folder reorder.
    if (aid.startsWith('F:')) {
      if (!oid.startsWith('F:')) return;
      const oldI = folders.findIndex((f) => `F:${f.id}` === aid);
      const newI = folders.findIndex((f) => `F:${f.id}` === oid);
      if (oldI < 0 || newI < 0) return;
      const next = arrayMove(folders, oldI, newI);
      void persistFolderOrder(next.map((f, i) => ({ id: f.id, order: i })));
      return;
    }

    // Session move / reorder.
    const sid = aid.slice(2);
    const session = sessions.find((s) => s.id === sid);
    if (!session) return;

    let targetFolderId: string | null;
    let targetList: Session[];
    let insertIndex: number;

    if (oid === ROOT) {
      targetFolderId = null;
      targetList = rootSessions;
      insertIndex = targetList.length;
    } else if (oid.startsWith('F:')) {
      targetFolderId = oid.slice(2);
      targetList = inFolder(targetFolderId);
      insertIndex = targetList.length;
    } else if (oid.startsWith('S:')) {
      const overSession = sessions.find((s) => s.id === oid.slice(2));
      if (!overSession) return;
      targetFolderId = overSession.folderId ?? null;
      targetList = targetFolderId ? inFolder(targetFolderId) : rootSessions;
      insertIndex = targetList.findIndex((s) => s.id === overSession.id);
      if (insertIndex < 0) insertIndex = targetList.length;
    } else {
      return;
    }

    const sourceFolderId = session.folderId ?? null;

    if (sourceFolderId === targetFolderId) {
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

  if (folders.length === 0 && sessions.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-xs text-muted-foreground">
        No conversations yet.
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
      <div className="flex flex-col gap-0.5">
        <SortableContext
          items={folders.map((f) => `F:${f.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {folders.map((f) => (
            <div key={f.id} className="flex flex-col gap-0.5">
              <FolderRow folder={f} count={inFolder(f.id).length} />
              {!collapsed[f.id] && (
                <SortableContext
                  items={inFolder(f.id).map((s) => `S:${s.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-0.5">
                    {inFolder(f.id).map((s) => (
                      <SessionRow key={s.id} session={s} nested />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          ))}
        </SortableContext>

        <RootZone hasFolders={folders.length > 0}>
          <SortableContext
            items={rootSessions.map((s) => `S:${s.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {rootSessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </SortableContext>
        </RootZone>
      </div>

      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="flex h-8 items-center rounded-md border border-border bg-popover px-2 text-sm shadow-md">
            <span className="max-w-48 truncate">{active.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function RootZone({
  hasFolders,
  children,
}: {
  hasFolders: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: ROOT });
  const sessionOver = isOver && String(active?.id ?? '').startsWith('S:');

  return (
    <div ref={setNodeRef} className="mt-0.5 flex flex-col gap-0.5">
      {hasFolders && (
        <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Chats
        </p>
      )}
      <div
        className={cn(
          'flex min-h-2 flex-col gap-0.5 rounded-md',
          sessionOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
        )}
      >
        {children}
      </div>
    </div>
  );
}
