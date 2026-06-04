import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Reasoning({
  text,
  thinking,
  durationMs,
}: {
  text: string;
  /** The model is still thinking — no answer text has streamed yet. */
  thinking?: boolean;
  durationMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-expand while the model thinks so the thoughts are visible as they
  // land, then auto-collapse to the summary the moment the answer starts —
  // not at the end of the whole turn. A manual toggle opts out of both.
  useEffect(() => {
    if (!touched) setOpen(!!thinking);
  }, [thinking, touched]);

  // Follow the newest line while thoughts stream into the height-capped panel.
  useEffect(() => {
    const el = bodyRef.current;
    if (thinking && open && el) el.scrollTop = el.scrollHeight;
  }, [text, thinking, open]);

  const label = thinking
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
        <span className={cn(thinking && 'animate-pulse text-primary')}>{label}</span>
      </button>
      {open && (
        <div
          ref={bodyRef}
          className={cn(
            'whitespace-pre-wrap border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground',
            thinking && 'max-h-48 overflow-y-auto',
          )}
        >
          {text}
        </div>
      )}
    </div>
  );
}
