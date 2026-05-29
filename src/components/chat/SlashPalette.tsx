import type { Prompt } from '@/db/types';
import { cn } from '@/lib/utils';

export function SlashPalette({
  prompts,
  activeIndex,
  onSelect,
}: {
  prompts: Prompt[];
  activeIndex: number;
  onSelect: (prompt: Prompt) => void;
}) {
  if (prompts.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden border border-border bg-popover">
      <div className="label-mono px-3 pb-1 pt-2 text-muted-foreground">
        Quick prompts
      </div>
      <ul className="max-h-64 overflow-y-auto pb-1">
        {prompts.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              // mousedown (not click) so the textarea doesn't blur first.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(p);
              }}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left',
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              <span className="text-sm font-medium">{p.title}</span>
              {p.content && (
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {p.content}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
