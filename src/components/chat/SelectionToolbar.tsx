import { Marginalia } from '@/components/ui/marginalia';
import { confirm } from '@/components/ui/confirm';
import { getAppConfig } from '@/db/db';
import { deleteSubtree } from '@/db/repo';
import type { Message } from '@/db/types';
import { downloadText, messagesToMarkdown, slugify } from '@/lib/export';
import { useUiStore } from '@/store/ui';

/** Bulk actions for multi-selected messages (you + assistant turns). */
export function SelectionToolbar({
  messages,
  selectableIds,
}: {
  messages: Message[];
  selectableIds: string[];
}) {
  const selected = useUiStore((s) => s.selected);
  const setSelection = useUiStore((s) => s.setSelection);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const toggleSelectionMode = useUiStore((s) => s.toggleSelectionMode);

  const ids = selectableIds.filter((id) => selected[id]);
  const count = ids.length;
  const allSelected = count > 0 && count === selectableIds.length;

  const chosen = (): Message[] =>
    messages.filter((m) => selected[m.id] && m.role !== 'divider');

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
        'Selected messages and everything below them on their branch will be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) await deleteSubtree(id);
    clearSelection();
  };

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-6 py-2.5 backdrop-blur">
      <span className="label-mono tabular-nums text-muted-foreground">
        {count} selected
      </span>
      <span className="text-muted-foreground/30">·</span>
      <Marginalia
        disabled={selectableIds.length === 0}
        onClick={() =>
          allSelected ? clearSelection() : setSelection(selectableIds)
        }
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </Marginalia>
      <div className="ml-auto flex items-center gap-3">
        <Marginalia disabled={!count} onClick={() => void copy()}>
          Copy
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia disabled={!count} onClick={() => void exportMd()}>
          Export
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia disabled={!count} onClick={() => void remove()}>
          Delete
        </Marginalia>
        <span className="text-muted-foreground/30">·</span>
        <Marginalia onClick={toggleSelectionMode}>Done</Marginalia>
      </div>
    </div>
  );
}
