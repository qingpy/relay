import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Reasoning({
  text,
  streaming,
  durationMs,
}: {
  text: string;
  streaming?: boolean;
  durationMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-expand for the whole streaming turn so the thoughts are visible as they
  // land — regardless of whether the provider streams reasoning before the answer
  // or interleaves the two — then auto-collapse to the summary once the turn
  // finishes. A manual toggle opts out of both.
  useEffect(() => {
    if (!touched) setOpen(!!streaming);
  }, [streaming, touched]);

  // Follow the newest line while thoughts stream into the height-capped panel.
  useEffect(() => {
    const el = bodyRef.current;
    if (streaming && open && el) el.scrollTop = el.scrollHeight;
  }, [text, streaming, open]);

  const label = streaming
    ? 'Thinking…'
    : durationMs != null
      ? `Thought for ${(durationMs / 1000).toFixed(1)}s`
      : 'Thoughts';

  return (
    <div className="overflow-hidden border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => {
          setTouched(true);
          setOpen((o) => !o);
        }}
        className="label-mono flex w-full items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        <span className={cn(streaming && 'animate-pulse text-primary')}>{label}</span>
      </button>
      {open && (
        <div
          ref={bodyRef}
          className={cn(
            'whitespace-pre-wrap border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground',
            streaming && 'max-h-48 overflow-y-auto',
          )}
        >
          {text}
        </div>
      )}
    </div>
  );
}
