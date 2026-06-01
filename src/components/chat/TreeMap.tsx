import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare } from '@/components/ui/check-square';
import { Marginalia } from '@/components/ui/marginalia';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getMessages, getSession, setCurrentLeaf, spliceMessage } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText } from '@/lib/conversation';
import { activePath, childrenOf, leafOf } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';

function label(m: Message): string {
  if (m.role === 'divider') return 'Context cleared';
  const text = partsText(m.content).replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (m.reasoning) return 'Thinking…';
  if (m.toolCalls?.length) return 'Tool call';
  if (m.error) return 'Error';
  return '(empty)';
}

const ROLE_TONE: Record<string, string> = {
  user: 'text-primary',
  assistant: 'text-foreground',
  divider: 'text-muted-foreground',
};

function roleTag(m: Message): string {
  return m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : '—';
}

/**
 * The branch map: a top-to-bottom outline of the whole conversation tree. A
 * straight run of replies stays flush (so a long linear chat reads as a simple
 * list); only a real fork — a message with more than one reply — indents its
 * alternative branches. The active branch is highlighted.
 *
 * Default click locates a message: it makes that message's branch active and
 * scrolls the chat to it. A "Select" toggle turns rows into checkboxes for bulk
 * deletion (each picked message is spliced out, its replies kept).
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

  const activeSet = useMemo(
    () => new Set(activePath(all, session?.currentLeafId).map((m) => m.id)),
    [all, session?.currentLeafId],
  );
  const roots = useMemo(() => childrenOf(all, null), [all]);

  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Record<string, true>>({});
  const selCount = Object.keys(sel).length;
  // Anchor for shift-range selection (the last plainly-clicked row).
  const anchorRef = useRef<string | null>(null);

  // Selectable message ids in the order they appear in the map (tree preorder),
  // so a shift-range covers exactly the rows between two clicks.
  const order = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: Message[]) => {
      for (const n of nodes) {
        if (n.role !== 'divider') out.push(n.id);
        walk(childrenOf(all, n.id));
      }
    };
    walk(roots);
    return out;
  }, [all, roots]);
  const allChecked = order.length > 0 && selCount === order.length;

  const reset = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSel({});
      setSelectMode(false);
      anchorRef.current = null;
    }
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSel({});
    anchorRef.current = null;
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  // Click toggles one row; shift-click extends to cover the whole span between
  // the anchor and the clicked row (Explorer-style).
  const selectAt = (id: string, shift: boolean) => {
    if (shift && anchorRef.current) {
      const a = order.indexOf(anchorRef.current);
      const b = order.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSel((s) => {
          const next = { ...s };
          for (const rid of order.slice(lo, hi + 1)) next[rid] = true;
          return next;
        });
        anchorRef.current = id;
        return;
      }
    }
    toggle(id);
    anchorRef.current = id;
  };

  const locate = (m: Message) => {
    if (!activeSet.has(m.id)) void setCurrentLeaf(sessionId, leafOf(all, m.id));
    requestLocate(m.id);
    reset(false);
  };

  const deleteSelected = async () => {
    if (selCount === 0) return;
    for (const id of Object.keys(sel)) await spliceMessage(id);
    setSel({});
  };

  const row = (node: Message): React.ReactNode => {
    const kids = childrenOf(all, node.id);
    const onPath = activeSet.has(node.id);
    const checked = !!sel[node.id];
    const selectable = node.role !== 'divider';
    return (
      <div
        key={node.id}
        onClick={(e) =>
          selectMode
            ? selectable && selectAt(node.id, e.shiftKey)
            : locate(node)
        }
        className={cn(
          'flex cursor-pointer select-none items-center gap-2 py-1.5 pl-2 pr-2 text-sm transition-colors',
          onPath ? 'text-foreground' : 'text-muted-foreground',
          checked
            ? 'bg-primary/5 ring-1 ring-inset ring-primary/30'
            : onPath && !selectMode
              ? 'bg-accent'
              : 'hover:bg-accent/60',
        )}
      >
        {selectMode &&
          (selectable ? (
            <CheckSquare checked={checked} />
          ) : (
            <span className="size-3.5 shrink-0" />
          ))}
        <span
          className={cn(
            'label-mono inline-flex w-7 shrink-0 items-center',
            ROLE_TONE[node.role] ?? 'text-muted-foreground',
          )}
        >
          {roleTag(node)}
        </span>
        <span className="min-w-0 flex-1 truncate">{label(node)}</span>
        {kids.length > 1 && (
          <span className="label-mono shrink-0 text-[10px] text-muted-foreground">
            {kids.length} branches
          </span>
        )}
      </div>
    );
  };

  // Render a vertical run of siblings. A single child continues the spine at the
  // same indent; multiple children fork — each branch nests one level deeper,
  // with a hairline guide.
  const renderChain = (nodes: Message[]): React.ReactNode => {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) {
      const n = nodes[0];
      return (
        <>
          {row(n)}
          {renderChain(childrenOf(all, n.id))}
        </>
      );
    }
    return nodes.map((n) => (
      <div key={n.id} className="ml-3 border-l border-border pl-2">
        {row(n)}
        {renderChain(childrenOf(all, n.id))}
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Marginalia>Map</Marginalia>
      </DialogTrigger>
      <DialogContent
        className="max-w-xl"
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => {
          // Esc peels one layer at a time: leave select mode first, then close.
          if (selectMode) {
            e.preventDefault();
            exitSelect();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Branch map</DialogTitle>
        </DialogHeader>

        {order.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border pb-2 text-sm">
            {selectMode ? (
              <>
                <span className="label-mono tabular-nums text-muted-foreground">
                  {selCount} selected
                </span>
                <Marginalia
                  onClick={() =>
                    setSel(
                      allChecked
                        ? {}
                        : Object.fromEntries(order.map((id) => [id, true])),
                    )
                  }
                >
                  {allChecked ? 'None' : 'All'}
                </Marginalia>
                <div className="ml-auto flex items-center gap-3">
                  <Marginalia
                    disabled={selCount === 0}
                    onClick={() => void deleteSelected()}
                  >
                    Delete
                  </Marginalia>
                  <span className="text-muted-foreground/30">·</span>
                  <Marginalia onClick={exitSelect}>Done</Marginalia>
                </div>
              </>
            ) : (
              <Marginalia
                className="ml-auto"
                onClick={() => setSelectMode(true)}
              >
                Select
              </Marginalia>
            )}
          </div>
        )}

        <div className="-mx-2 max-h-[55vh] overflow-y-auto">
          {roots.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          ) : (
            renderChain(roots)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
