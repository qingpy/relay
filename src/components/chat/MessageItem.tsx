import { memo, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Message } from '@/db/types';
import { spliceMessage, textPart, updateMessage } from '@/db/repo';
import { partsText } from '@/lib/conversation';
import { formatRelative, formatDateTime } from '@/lib/time';
import { useChatStore } from '@/store/chat';
import { Citations } from './Citations';
import { Markdown } from './Markdown';
import { MessageActions } from './MessageActions';
import { MessageAttachments } from './MessageAttachments';
import { Reasoning } from './Reasoning';
import { SiblingSwitcher } from './SiblingSwitcher';
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
  siblings,
}: {
  message: Message;
  siblings: Message[];
}) {
  const buffer = useChatStore((s) => s.streams[message.id]);
  const streaming = !!buffer;
  const [editing, setEditing] = useState(false);

  if (message.role === 'divider') {
    return (
      <div className="group my-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5">
          Context cleared
          <button
            type="button"
            onClick={() => void spliceMessage(message.id)}
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
    if (editing) {
      return <UserEditor message={message} onClose={() => setEditing(false)} />;
    }
    const attachmentIds = message.attachments ?? [];
    return (
      <div className="group flex flex-col items-end gap-1">
        {attachmentIds.length > 0 && (
          <MessageAttachments fileIds={attachmentIds} />
        )}
        {text && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed">
            {text}
          </div>
        )}
        <div className="flex items-center gap-1">
          <SiblingSwitcher message={message} allMessages={siblings} />
          <MessageActions
            message={message}
            allMessages={siblings}
            onEdit={() => setEditing(true)}
          />
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={formatDateTime(message.createdAt)}
            className="text-[11px] text-muted-foreground"
          >
            {formatRelative(message.createdAt)}
          </time>
        </div>
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
      {!streaming && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <SiblingSwitcher message={message} allMessages={siblings} />
            <MessageActions message={message} allMessages={siblings} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {message.model && (
              <span className="max-w-48 truncate" title={message.model}>
                {message.model}
              </span>
            )}
            {message.usage?.totalTokens != null && (
              <span>{message.usage.totalTokens} tokens</span>
            )}
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              title={formatDateTime(message.createdAt)}
            >
              {formatRelative(message.createdAt)}
            </time>
          </div>
        </div>
      )}
    </div>
  );
});

function UserEditor({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => partsText(message.content));
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    resize(el);
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = async () => {
    const text = value.trim();
    if (!text) return;
    onClose();
    await updateMessage(message.id, { content: [textPart(text)] });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="w-full max-w-[85%] rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={(e) => {
            setValue(e.target.value);
            resize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void save();
            }
          }}
          className="block max-h-60 min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={!value.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
