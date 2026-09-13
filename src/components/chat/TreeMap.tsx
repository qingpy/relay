import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare } from '@/components/ui/check-square';
import { confirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Marginalia } from '@/components/ui/marginalia';
import { getMessages, getSession, setCurrentLeaf, spliceMessage } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText } from '@/lib/conversation';
import { activePath, leafOf, segmentTree, type Segment } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';

function snippet(m: Message): string {
  if (m.role === 'divider') return 'Context cleared';
  const text = partsText(m.content).replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (m.reasoning) return 'Thinking…';
  if (m.toolCalls?.length) return 'Tool call';
  if (m.error) return 'Error';
  return '(empty)';
}

function roleTag(m: Message): string {
  return m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : '';
}

function walkSegments(tree: Segment[], fn: (s: Segment) => void) {
  const walk = (s: Segment) => {
    fn(s);
    for (const c of s.children) walk(c);
  };
  for (const s of tree) walk(s);
}

function expandableIds(tree: Segment[]): string[] {
  const ids: string[] = [];
  walkSegments(tree, (s) => {
    if (s.messages.length > 1) ids.push(s.id);
  });
  return ids;
}

function allMessageIds(tree: Segment[]): string[] {
  const ids: string[] = [];
  walkSegments(tree, (s) => {
    for (const m of s.messages) ids.push(m.id);
  });
  return ids;
}

/**
 * Branch map: a modal skeleton of the conversation tree. Each row is a linear
 * stretch between forks (a divider is its own row). Parallel heads sit as
 * siblings. Select mode checks individual messages. Delete splices those turns.
 */
export function TreeMap({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const requestLocate = useUiStore((s) => s.requestLocate);

  const all = useLiveQuery(
    () => (open ? getMessages(sessionId) : Promise.resolve([])),
    [sessionId, open],
    [],
  );
  const session = useLiveQuery(
    () => (open ? getSession(sessionId) : undefined),
    [sessionId, open],
  );

  const tree = useMemo(() => segmentTree(all), [all]);
  const activeSet = useMemo(
    () => new Set(activePath(all, session?.currentLeafId).map((m) => m.id)),
    [all, session?.currentLeafId],
  );
  const canExpand = useMemo(() => expandableIds(tree), [tree]);
  const messageIds = useMemo(() => allMessageIds(tree), [tree]);

  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Record<string, true>>({});
  const selCount = Object.keys(sel).length;
  const allChecked = messageIds.length > 0 && selCount === messageIds.length;

  const reset = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSel({});
      setExpanded({});
      setSelectMode(false);
    }
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSel({});
  };

  const show = (m: Message) => {
    if (!activeSet.has(m.id)) void setCurrentLeaf(sessionId, leafOf(all, m.id));
    requestLocate(m.id);
    reset(false);
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const expandAll = () =>
    setExpanded(Object.fromEntries(canExpand.map((id) => [id, true])));
  const collapseAll = () => setExpanded({});

  const toggleMessage = (id: string) =>
    setSel((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const deleteSelected = async () => {
    const ids = Object.keys(sel);
    if (ids.length === 0) return;
    if (ids.length > 1) {
      const ok = await confirm({
        title: 'Delete messages?',
        description: `${ids.length} messages will be removed. Replies are kept.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
    }
    for (const id of ids) await spliceMessage(id);
    setSel({});
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Marginalia active={open}>Map</Marginalia>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => {
          if (selectMode) {
            e.preventDefault();
            exitSelect();
          }
        }}
      >
        <DialogHeader className="border-b border-border px-6 py-4 pr-16">
          <div className="flex items-center gap-3">
            <DialogTitle>Map</DialogTitle>
            {selectMode && (
              <span className="label-mono tabular-nums text-muted-foreground">
                {selCount} selected
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              {canExpand.length > 0 && (
                <>
                  <Marginalia
                    onClick={expandAll}
                    disabled={canExpand.every((id) => expanded[id])}
                  >
                    Expand all
                  </Marginalia>
                  <span className="text-muted-foreground/30">·</span>
                  <Marginalia
                    onClick={collapseAll}
                    disabled={Object.keys(expanded).length === 0}
                  >
                    Collapse all
                  </Marginalia>
                  <span className="text-muted-foreground/30">·</span>
                </>
              )}
              {selectMode ? (
                <>
                  <Marginalia
                    onClick={() =>
                      setSel(
                        allChecked
                          ? {}
                          : Object.fromEntries(messageIds.map((id) => [id, true])),
                      )
                    }
                  >
                    {allChecked ? 'None' : 'All'}
                  </Marginalia>
                  <Marginalia
                    disabled={selCount === 0}
                    onClick={() => void deleteSelected()}
                  >
                    Delete
                  </Marginalia>
                  <span className="text-muted-foreground/30">·</span>
                  <Marginalia onClick={exitSelect}>Done</Marginalia>
                </>
              ) : (
                <Marginalia
                  onClick={() => setSelectMode(true)}
                  disabled={messageIds.length === 0}
                >
                  Select
                </Marginalia>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tree.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          ) : (
            tree.map((seg) => (
              <BranchRow
                key={seg.id}
                seg={seg}
                activeSet={activeSet}
                currentLeafId={session?.currentLeafId}
                expanded={expanded}
                selectMode={selectMode}
                sel={sel}
                onToggle={toggleMessage}
                onExpand={toggleExpand}
                onShow={show}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BranchRow({
  seg,
  activeSet,
  currentLeafId,
  expanded,
  selectMode,
  sel,
  onToggle,
  onExpand,
  onShow,
}: {
  seg: Segment;
  activeSet: Set<string>;
  currentLeafId?: string;
  expanded: Record<string, true>;
  selectMode: boolean;
  sel: Record<string, true>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  onShow: (m: Message) => void;
}) {
  const head = seg.messages[0];
  const n = seg.messages.length;
  const open = !!expanded[seg.id];
  const checked = !!sel[head.id];
  const onPath = seg.messages.some((m) => activeSet.has(m.id));
  const here = seg.messages.some((m) => m.id === currentLeafId);
  const divider = head.role === 'divider';

  const onRow = (m: Message) =>
    selectMode ? onToggle(m.id) : onShow(m);

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer select-none items-center gap-2 py-1.5 pr-1 text-sm transition-colors hover:bg-accent/60',
          divider && 'italic',
          onPath ? 'text-foreground' : 'text-muted-foreground',
          checked && 'bg-primary/5',
          here && !checked && 'bg-accent',
        )}
        onClick={() => onRow(head)}
      >
        {n > 1 ? (
          <button
            type="button"
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              onExpand(seg.id);
            }}
            className="flex w-3 shrink-0 justify-center font-mono text-[0.7rem] text-muted-foreground/60 hover:text-foreground"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {selectMode && <CheckSquare checked={checked} />}
        {!divider && (
          <span
            className={cn(
              'label-mono inline-flex w-7 shrink-0 items-center',
              head.role === 'user' ? 'text-primary' : 'text-foreground',
            )}
          >
            {roleTag(head)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{snippet(head)}</span>
        {n > 1 && (
          <span className="label-mono shrink-0 tabular-nums text-muted-foreground/50">
            {n}
          </span>
        )}
        {here && (
          <span className="label-mono shrink-0 text-[10px] text-primary">
            now
          </span>
        )}
        {!selectMode && (
          <Marginalia
            className="opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onShow(head);
            }}
          >
            Show
          </Marginalia>
        )}
      </div>

      {(open && n > 1) || seg.children.length > 0 ? (
        <div className="ml-5 border-l border-border pl-3">
          {open &&
            n > 1 &&
            seg.messages.slice(1).map((m) => (
              <div
                key={m.id}
                onClick={() => onRow(m)}
                className={cn(
                  'group/in flex cursor-pointer select-none items-center gap-2 py-1 pr-1 text-sm transition-colors hover:bg-accent/60',
                  m.role === 'divider' && 'italic',
                  sel[m.id]
                    ? 'bg-primary/5 text-foreground'
                    : m.id === currentLeafId
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {selectMode && <CheckSquare checked={!!sel[m.id]} />}
                {m.role !== 'divider' && (
                  <span className="label-mono inline-flex w-7 shrink-0 items-center">
                    {roleTag(m)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{snippet(m)}</span>
              </div>
            ))}
          {seg.children.map((child) => (
            <BranchRow
              key={child.id}
              seg={child}
              activeSet={activeSet}
              currentLeafId={currentLeafId}
              expanded={expanded}
              selectMode={selectMode}
              sel={sel}
              onToggle={onToggle}
              onExpand={onExpand}
              onShow={onShow}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
