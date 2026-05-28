import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createPrompt, deletePrompt, listPrompts, updatePrompt } from '@/db/repo';
import type { Prompt } from '@/db/types';
import { cn } from '@/lib/utils';

const labelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

export function PromptsDialog() {
  const prompts = useLiveQuery(() => listPrompts(), [], []);
  const [open, setOpen] = useState(false);
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
    <section className="flex flex-col gap-2">
      <h3 className={labelClass}>Quick prompts</h3>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="self-start">
            Manage prompts ({prompts.length})
          </Button>
        </DialogTrigger>
        <DialogContent className="flex h-[70vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>Quick prompts</DialogTitle>
            <DialogDescription>
              Insert any of these in the composer by typing “/”.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-3">
            <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-border pr-2">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-1.5"
                onClick={() => void add()}
              >
                <Plus className="size-3.5" />
                New prompt
              </Button>
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
                      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors',
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
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Editor({ prompt, onDelete }: { prompt: Prompt; onDelete: () => void }) {
  const [title, setTitle] = useState(prompt.title);
  const [content, setContent] = useState(prompt.content);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          placeholder="Title"
          onChange={(e) => {
            setTitle(e.target.value);
            void updatePrompt(prompt.id, { title: e.target.value });
          }}
        />
        <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Delete prompt">
          <Trash2 />
        </Button>
      </div>
      <textarea
        value={content}
        placeholder="Prompt text…"
        spellCheck={false}
        onChange={(e) => {
          setContent(e.target.value);
          void updatePrompt(prompt.id, { content: e.target.value });
        }}
        className="min-h-0 flex-1 resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
