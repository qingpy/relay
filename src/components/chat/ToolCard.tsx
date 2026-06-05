import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ToolCall } from '@/db/types';
import { cn } from '@/lib/utils';

function pretty(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const args = pretty(call.args);

  return (
    <div className="overflow-hidden border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="label-mono flex w-full items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        <span>{(call.name || 'tool').replace(/[_-]+/g, ' ')}</span>
        {call.pending && <span className="animate-pulse text-primary">running…</span>}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 text-xs">
          {args && (
            <>
              <div className="label-mono mb-1 text-muted-foreground">Arguments</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                {args}
              </pre>
            </>
          )}
          {call.result != null && (
            <>
              <div className="label-mono mb-1 mt-2 text-muted-foreground">Result</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                {pretty(call.result)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
