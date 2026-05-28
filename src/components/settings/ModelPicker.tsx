import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SavedModel } from '@/db/types';
import { cn } from '@/lib/utils';

/**
 * Pick which models to keep in a connection's catalog from a (possibly large)
 * detected list. Already-saved models are shown and pre-checked even if the
 * listing didn't return them.
 */
export function ModelPicker({
  open,
  onOpenChange,
  available,
  saved,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: string[];
  saved: SavedModel[];
  onConfirm: (ids: string[]) => void;
}) {
  const savedIds = useMemo(() => saved.map((m) => m.id), [saved]);
  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...savedIds, ...available].filter((id) =>
      seen.has(id) ? false : (seen.add(id), true),
    );
  }, [available, savedIds]);

  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(savedIds.map((id) => [id, true])),
  );

  const filtered = all.filter((id) =>
    id.toLowerCase().includes(query.toLowerCase()),
  );
  const count = all.filter((id) => checked[id]).length;
  const allFilteredChecked =
    filtered.length > 0 && filtered.every((id) => checked[id]);

  const toggleAll = () =>
    setChecked((c) => {
      const next = { ...c };
      for (const id of filtered) next[id] = !allFilteredChecked;
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Choose models</DialogTitle>
          <DialogDescription>
            {available.length} available · {count} selected. Pick the ones to keep
            in this connection's catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter models…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            disabled={filtered.length === 0}
          >
            {allFilteredChecked ? 'None' : 'All'}
          </Button>
        </div>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="flex flex-col gap-0.5">
            {filtered.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No matching models.
              </p>
            )}
            {filtered.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setChecked((c) => ({ ...c, [id]: !c[id] }))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    checked[id]
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {checked[id] && <Check className="size-3" />}
                </span>
                <span className="min-w-0 truncate">{id}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onConfirm(all.filter((id) => checked[id]));
              onOpenChange(false);
            }}
          >
            Save {count}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
