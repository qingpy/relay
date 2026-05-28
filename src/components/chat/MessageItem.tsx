import { memo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Message } from '@/db/types';
import { deleteMessage } from '@/db/repo';
import { partsText } from '@/lib/conversation';
import { useChatStore } from '@/store/chat';
import { Citations } from './Citations';
import { Markdown } from './Markdown';
import { MessageActions } from './MessageActions';
import { MessageAttachments } from './MessageAttachments';
import { Reasoning } from './Reasoning';
import { ToolCard } from './ToolCard';

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
      <div className="group my-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5">
          Context cleared
          <button
            type="button"
            onClick={() => void deleteMessage(message.id)}
            title="Restore context"
            className="flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const text = streaming ? buffer.text : partsText(message.content);
  const reasoning = streaming ? buffer.reasoning : message.reasoning ?? '';
  const reasoningMs = streaming ? buffer.reasoningMs : message.reasoningMs;
  const toolCalls = streaming ? buffer.toolCalls : message.toolCalls ?? [];
  const citations = streaming ? buffer.citations : message.citations ?? [];

  if (message.role === 'user') {
    const attachmentIds = message.attachments ?? [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {attachmentIds.length > 0 && (
          <MessageAttachments fileIds={attachmentIds} />
        )}
        {text && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed">
            {text}
          </div>
        )}
      </div>
    );
  }

  const showDots =
    streaming && !text && !reasoning && toolCalls.length === 0;

  return (
    <div className="group">
      {reasoning && (
        <Reasoning
          text={reasoning}
          streaming={streaming}
          hasAnswer={!!text}
          durationMs={reasoningMs}
        />
      )}
      {toolCalls.map((tc, i) => (
        <ToolCard key={tc.id || i} call={tc} />
      ))}
      {text ? <Markdown>{text}</Markdown> : showDots ? <StreamingDots /> : null}
      {message.error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{message.error}</span>
        </div>
      )}
      {citations.length > 0 && <Citations citations={citations} />}
      {!streaming && (text || reasoning) && (
        <div className="flex items-center justify-between">
          <MessageActions message={message} />
          {message.usage?.totalTokens != null && (
            <span className="text-[11px] text-muted-foreground">
              {message.usage.totalTokens} tokens
            </span>
          )}
        </div>
      )}
    </div>
  );
});
