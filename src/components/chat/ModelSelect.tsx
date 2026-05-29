import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Connection } from '@/db/types';
import { modelGroups } from '@/lib/models';

/**
 * The header's model picker — a quiet "Model · <id>" line that opens a grouped
 * menu of every enabled connection's catalog. Editorial, not a boxed <select>.
 */
export function ModelSelect({
  connections,
  connectionId,
  model,
  disabled,
  onSelect,
}: {
  connections: Connection[];
  connectionId: string;
  model: string;
  disabled?: boolean;
  onSelect: (connectionId: string, model: string) => void;
}) {
  const groups = modelGroups(connections);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || groups.length === 0}
          title="Model"
          className="group flex min-w-0 items-center gap-2 outline-none disabled:opacity-50"
        >
          <span className="label-mono text-muted-foreground">Model</span>
          <span className="max-w-[14rem] truncate font-mono text-xs text-foreground transition-colors group-hover:text-primary">
            {model || 'none'}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {groups.map((c) => (
          <div key={c.id}>
            <DropdownMenuLabel className="label-mono">{c.name}</DropdownMenuLabel>
            {c.models.map((m) => {
              const selected = c.id === connectionId && m.id === model;
              return (
                <DropdownMenuItem
                  key={m.id}
                  className="gap-2"
                  onSelect={() => onSelect(c.id, m.id)}
                >
                  {selected ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 truncate font-mono text-xs">
                    {m.label || m.id}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
