import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, GitBranch, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { deleteSubtree, getMessages, getSession, setCurrentLeaf } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText } from '@/lib/conversation';
import { activePath, childrenOf, leafOf } from '@/lib/tree';
import { cn } from '@/lib/utils';

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

export function TreeMap({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
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
  const branched = useMemo(
    () => all.some((m) => childrenOf(all, m.id).length > 1) || roots.length > 1,
    [all, roots],
  );

  const [sel, setSel] = useState<Record<string, true>>({});
  const selCount = Object.keys(sel).length;
  const allChecked = all.length > 0 && selCount === all.length;

  const setOpenReset = (v: boolean) => {
    setOpen(v);
    if (!v) setSel({});
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const pick = (m: Message) => {
    void setCurrentLeaf(sessionId, leafOf(all, m.id));
    setOpenReset(false);
  };

  const deleteSelected = async () => {
    if (selCount === 0) return;
    const ok = await confirm({
      title: `Delete ${selCount} message${selCount > 1 ? 's' : ''}?`,
      description:
        'Each selected message and every reply below it will be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of Object.keys(sel)) await deleteSubtree(id);
    setSel({});
  };

  const renderNode = (node: Message, depth: number): React.ReactNode => {
    const kids = childrenOf(all, node.id);
    const onPath = activeSet.has(node.id);
    const checked = !!sel[node.id];
    return (
      <div key={node.id}>
        <div
          className={cn(
            'flex items-center rounded-md transition-colors',
            onPath
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60',
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggle(node.id)}
            role="checkbox"
            aria-checked={checked}
            title="Select"
            className={cn(
              'mr-2 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input',
            )}
          >
            {checked && <Check className="size-3" />}
          </button>
          <button
            type="button"
            onClick={() => pick(node)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-sm hover:text-foreground"
          >
            <span
              className={cn(
                'inline-flex shrink-0 items-center text-[10px] font-medium uppercase tracking-wide',
                ROLE_TONE[node.role] ?? 'text-muted-foreground',
              )}
            >
              {node.role === 'user'
                ? 'You'
                : node.role === 'assistant'
                  ? 'AI'
                  : '—'}
            </span>
            <span className="min-w-0 flex-1 truncate">{label(node)}</span>
            {kids.length > 1 && (
              <span
                className="shrink-0 rounded bg-secondary px-1 text-[10px] text-muted-foreground"
                title={`${kids.length} branches`}
              >
                {kids.length}
              </span>
            )}
          </button>
        </div>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpenReset}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Branch map"
          aria-label="Branch map"
        >
          <GitBranch />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Branch map</DialogTitle>
          <DialogDescription>
            {branched
              ? 'Click a message to make its branch active, or select messages to delete.'
              : 'Click a message to jump to it, or select messages to delete.'}
          </DialogDescription>
        </DialogHeader>

        {all.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border pb-2 text-sm">
            <span className="tabular-nums text-muted-foreground">
              {selCount} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSel(allChecked ? {} : Object.fromEntries(all.map((m) => [m.id, true])))}
            >
              {allChecked ? 'None' : 'All'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5 text-destructive hover:text-destructive"
              disabled={selCount === 0}
              onClick={() => void deleteSelected()}
            >
              <Trash2 className="size-3.5" />
              Delete selected
            </Button>
          </div>
        )}

        <div className="-mx-2 max-h-[55vh] overflow-y-auto">
          {roots.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          ) : (
            roots.map((r) => renderNode(r, 0))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
