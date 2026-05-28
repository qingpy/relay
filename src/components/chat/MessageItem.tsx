import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { Message } from '@/db/types';
import { partsText } from '@/lib/conversation';
import { useChatStore } from '@/store/chat';
import { Markdown } from './Markdown';
import { Reasoning } from './Reasoning';

function StreamingDots() {
  return (
    <span className="inline-flex h-5 items-center gap-1 text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
}: {
  message: Message;
}) {
  const buffer = useChatStore((s) => s.streams[message.id]);
  const streaming = !!buffer;

  if (message.role === 'divider') {
    return (
      <div className="my-2 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        Context cleared
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const text = streaming ? buffer.text : partsText(message.content);
  const reasoning = streaming ? buffer.reasoning : message.reasoning ?? '';

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      {reasoning && <Reasoning text={reasoning} streaming={streaming && !text} />}
      {text ? <Markdown>{text}</Markdown> : streaming ? <StreamingDots /> : null}
      {message.error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{message.error}</span>
        </div>
      )}
      {!streaming && message.usage?.totalTokens != null && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {message.usage.totalTokens} tokens
        </div>
      )}
    </div>
  );
});
