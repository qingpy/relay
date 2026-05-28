import { CheckCheck, Copy, Download, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { getAppConfig } from '@/db/db';
import { deleteSubtree } from '@/db/repo';
import type { Message } from '@/db/types';
import { downloadText, messagesToMarkdown, slugify } from '@/lib/export';
import { useUiStore } from '@/store/ui';

/** Bulk actions for multi-selected assistant messages. */
export function SelectionToolbar({
  messages,
  assistantIds,
}: {
  messages: Message[];
  assistantIds: string[];
}) {
  const selected = useUiStore((s) => s.selected);
  const setSelection = useUiStore((s) => s.setSelection);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const toggleSelectionMode = useUiStore((s) => s.toggleSelectionMode);

  const ids = assistantIds.filter((id) => selected[id]);
  const count = ids.length;
  const allSelected = count > 0 && count === assistantIds.length;

  const chosen = (): Message[] =>
    messages.filter((m) => selected[m.id] && m.role === 'assistant');

  const copy = async () => {
    if (!count) return;
    const { exportIncludeThinking } = await getAppConfig();
    await navigator.clipboard.writeText(
      messagesToMarkdown(chosen(), { includeThinking: exportIncludeThinking }),
    );
  };

  const exportMd = async () => {
    if (!count) return;
    const { exportIncludeThinking } = await getAppConfig();
    const md = messagesToMarkdown(chosen(), {
      includeThinking: exportIncludeThinking,
    });
    downloadText(`${slugify('selection')}.md`, md);
  };

  const remove = async () => {
    if (!count) return;
    const ok = await confirm({
      title: `Delete ${count} message${count > 1 ? 's' : ''}?`,
      description:
        'Selected replies and everything below them on their branch will be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) await deleteSubtree(id);
    clearSelection();
  };

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => (allSelected ? clearSelection() : setSelection(assistantIds))}
        disabled={assistantIds.length === 0}
      >
        <CheckCheck className="size-3.5" />
        {allSelected ? 'Deselect all' : 'Select all'}
      </Button>
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void copy()}
          disabled={!count}
          title="Copy as markdown"
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void exportMd()}
          disabled={!count}
          title="Export .md"
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void remove()}
          disabled={!count}
          title="Delete selected"
        >
          <Trash2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSelectionMode}
          title="Done"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
