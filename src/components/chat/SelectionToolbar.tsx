import { Marginalia } from '@/components/ui/marginalia';
import { getAppConfig } from '@/db/db';
import { spliceMessage } from '@/db/repo';
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

  // Remove only the selected messages — each is spliced out and its replies are
  // re-parented, so nothing below them is lost.
  const remove = async () => {
    if (!count) return;
    for (const id of ids) await spliceMessage(id);
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
