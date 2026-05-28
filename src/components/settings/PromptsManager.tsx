import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createPrompt,
  deletePrompt,
  listPrompts,
  updatePrompt,
} from '@/db/repo';

export function PromptsManager() {
  const prompts = useLiveQuery(() => listPrompts(), [], []);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quick prompts
        </h3>
        <Button size="sm" variant="ghost" onClick={() => void createPrompt()}>
          <Plus />
          Add
        </Button>
      </div>
      {prompts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Save reusable prompts here, then insert them in the composer by typing
          “/”.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {prompts.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border p-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={p.title}
                  placeholder="Title"
                  className="h-8"
                  onBlur={(e) =>
                    void updatePrompt(p.id, {
                      title: e.target.value.trim() || 'Untitled',
                    })
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void deletePrompt(p.id)}
                  title="Delete prompt"
                >
                  <Trash2 />
                </Button>
              </div>
              <textarea
                defaultValue={p.content}
                placeholder="Prompt text…"
                rows={2}
                onBlur={(e) => void updatePrompt(p.id, { content: e.target.value })}
                className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
