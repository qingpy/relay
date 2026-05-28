import { useEffect, useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Reasoning({
  text,
  streaming,
  hasAnswer,
  durationMs,
}: {
  text: string;
  streaming?: boolean;
  hasAnswer?: boolean;
  durationMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const thinking = !!streaming && !hasAnswer;

  // Auto-expand while actively thinking, auto-collapse once the answer starts —
  // unless the user has manually toggled it.
  useEffect(() => {
    if (!touched) setOpen(thinking);
  }, [thinking, touched]);

  const label = thinking
    ? 'Thinking…'
    : durationMs != null
      ? `Thought for ${(durationMs / 1000).toFixed(1)}s`
      : 'Thoughts';

  return (
    <div className="mb-2.5 overflow-hidden rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => {
          setTouched(true);
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        <Brain className={cn('size-3.5', thinking && 'animate-pulse text-primary')} />
        <span>{label}</span>
      </button>
      {open && (
        <div className="whitespace-pre-wrap border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}
