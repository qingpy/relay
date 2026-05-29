import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { FlatButton } from '@/components/ui/flat-button';
import { Input } from '@/components/ui/input';
import { createPrompt, deletePrompt, listPrompts, updatePrompt } from '@/db/repo';
import type { Prompt } from '@/db/types';
import { cn } from '@/lib/utils';
import { SectionLabel } from './SectionLabel';

/** Inline master-detail for managing quick prompts (a settings panel). */
export function PromptsManager() {
  const prompts = useLiveQuery(() => listPrompts(), [], []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = prompts.find((p) => p.id === selectedId) ?? prompts[0];

  const add = async () => {
    const p = await createPrompt();
    setSelectedId(p.id);
  };

  const onDelete = async (id: string) => {
    await deletePrompt(id);
    setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <SectionLabel>Quick prompts</SectionLabel>

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="flex w-48 shrink-0 flex-col gap-2 border-r border-border pr-3">
          <FlatButton className="justify-start" onClick={() => void add()}>
            <Plus />
            New prompt
          </FlatButton>
          <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
            {prompts.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No prompts yet.
              </p>
            )}
            {prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors',
                  selected?.id === p.id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span className="min-w-0 truncate">{p.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {selected ? (
            <Editor
              key={selected.id}
              prompt={selected}
              onDelete={() => void onDelete(selected.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a prompt, or create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Editor({ prompt, onDelete }: { prompt: Prompt; onDelete: () => void }) {
  const [title, setTitle] = useState(prompt.title);
  const [content, setContent] = useState(prompt.content);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          placeholder="Title"
          onChange={(e) => {
            setTitle(e.target.value);
            void updatePrompt(prompt.id, { title: e.target.value });
          }}
        />
        <button
          type="button"
          onClick={onDelete}
          title="Delete prompt"
          className="flex size-9 shrink-0 items-center justify-center border border-input text-muted-foreground transition-colors hover:border-foreground hover:text-primary"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <textarea
        value={content}
        placeholder="Prompt text…"
        spellCheck={false}
        onChange={(e) => {
          setContent(e.target.value);
          void updatePrompt(prompt.id, { content: e.target.value });
        }}
        className="min-h-0 flex-1 resize-none border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
