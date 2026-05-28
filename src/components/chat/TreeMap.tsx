import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { GitBranch, Trash2 } from 'lucide-react';
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

  const pick = (m: Message) => {
    void setCurrentLeaf(sessionId, leafOf(all, m.id));
    setOpen(false);
  };

  const remove = async (node: Message) => {
    if (childrenOf(all, node.id).length > 0) {
      const ok = await confirm({
        title: 'Delete this branch?',
        description: 'This message and every reply below it will be removed.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
    }
    await deleteSubtree(node.id);
  };

  const renderNode = (node: Message, depth: number): React.ReactNode => {
    const kids = childrenOf(all, node.id);
    const onPath = activeSet.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={cn(
            'group/node flex items-center rounded-md transition-colors',
            onPath
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60',
          )}
        >
          <button
            type="button"
            onClick={() => pick(node)}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left text-sm hover:text-foreground"
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
          <button
            type="button"
            onClick={() => void remove(node)}
            title="Delete this message & its replies"
            className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive group-hover/node:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              ? 'Click any message to make its branch the active conversation.'
              : 'This chat has no branches yet — regenerate or edit a message to create one.'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-[60vh] overflow-y-auto">
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
