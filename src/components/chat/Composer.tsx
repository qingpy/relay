import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startNewSession } from '@/lib/session-actions';
import { useChatStore } from '@/store/chat';

export function Composer({ sessionId }: { sessionId: string | null }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const streaming = useChatStore((s) =>
    sessionId ? !!s.activeBySession[sessionId] : false,
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const submit = async () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    const sid = sessionId ?? (await startNewSession()).id;
    await useChatStore.getState().send(sid, text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const stop = () => {
    if (sessionId) useChatStore.getState().stop(sessionId);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-1">
      <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Relay…"
          className="max-h-60 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {streaming ? (
          <Button size="icon" variant="secondary" onClick={stop} title="Stop generating">
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={!value.trim()}
            title="Send"
          >
            <ArrowUp />
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
