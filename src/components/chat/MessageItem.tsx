import { lazy, memo, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Marginalia } from '@/components/ui/marginalia';
import type { Message } from '@/db/types';
import { spliceMessage, textPart, updateMessage } from '@/db/repo';
import { partsText } from '@/lib/conversation';
import { formatStamp, formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat';
import { Citations } from './Citations';
import { MessageActions } from './MessageActions';
import { MessageAttachments } from './MessageAttachments';
import { Reasoning } from './Reasoning';
import { SiblingSwitcher } from './SiblingSwitcher';
import { ToolCard } from './ToolCard';

/** Indent that lines content/actions up under the role label (marker + gap). */
const INDENT = 'pl-[22px]';

/**
 * The markdown renderer pulls in KaTeX + highlight.js + the remark/rehype stack
 * (the bulk of the bundle), so it loads on demand. Until the chunk arrives the
 * raw text shows in the same `.md` box — readable instantly, no layout flash.
 */
const Markdown = lazy(() =>
  import('./Markdown').then((m) => ({ default: m.Markdown })),
);

function MessageBody({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="md whitespace-pre-wrap">{text}</div>}>
      <Markdown>{text}</Markdown>
    </Suspense>
  );
}

function RoleTag({ role }: { role: 'user' | 'assistant' }) {
  const assistant = role === 'assistant';
  return (
    <span className="flex items-center gap-3">
      <span
        className={cn(
          'size-2.5',
          assistant ? 'bg-primary' : 'border-2 border-foreground',
        )}
      />
      <span className={cn('label-mono', assistant && 'text-primary')}>
        {assistant ? 'Assistant' : 'You'}
      </span>
    </span>
  );
}

function Stamp({ at }: { at: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={formatDateTime(at)}>
      {formatStamp(at)}
    </time>
  );
}

function StreamingDots() {
  return (
    <span
      role="status"
      aria-label="Generating response"
      className="inline-flex h-5 items-center gap-1 text-muted-foreground"
    >
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
      <div className="group label-mono flex items-center gap-3 text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5">
          Context cleared
          <button
            type="button"
            onClick={() => void spliceMessage(message.id)}
            aria-label="Restore context"
            className="flex size-4 items-center justify-center text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
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
      <article className="group flex flex-col">
        <header className="flex items-center justify-between gap-4">
          <RoleTag role="user" />
          <span className="label-mono text-muted-foreground">
            <Stamp at={message.createdAt} />
          </span>
        </header>
        {attachmentIds.length > 0 && (
          <div className={cn('mt-3', INDENT)}>
            <MessageAttachments fileIds={attachmentIds} />
          </div>
        )}
        {text && (
          <div
            className={cn(
              'mt-3 whitespace-pre-wrap text-base leading-relaxed',
              INDENT,
            )}
          >
            {text}
          </div>
        )}
        <div className={cn('mt-3 flex items-center gap-4', INDENT)}>
          <SiblingSwitcher message={message} allMessages={siblings} />
          <MessageActions
            message={message}
            allMessages={siblings}
            onEdit={() => setEditing(true)}
          />
        </div>
      </article>
    );
  }

  const showDots = streaming && !text && !reasoning && toolCalls.length === 0;
  const retry = () => {
    if (message.parentId)
      void useChatStore.getState().regenerate(message.sessionId, message.parentId);
  };

  return (
    <article className="group flex flex-col" aria-busy={streaming}>
      <header className="flex items-center justify-between gap-4">
        <RoleTag role="assistant" />
        <div className="label-mono flex items-center gap-3 text-muted-foreground">
          {message.model && (
            <span className="max-w-[12rem] truncate" title={message.model}>
              {message.model}
            </span>
          )}
          {message.usage?.totalTokens != null && (
            <span>{message.usage.totalTokens} tok</span>
          )}
          {!streaming && <Stamp at={message.createdAt} />}
        </div>
      </header>

      <div className={cn('mt-3 flex flex-col gap-3', INDENT)}>
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
        {text ? <MessageBody text={text} /> : showDots ? <StreamingDots /> : null}
        {message.error && (
          <div
            role="alert"
            className="flex flex-col gap-2 border border-border border-l-2 border-l-primary bg-card px-3 py-2 text-sm"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="whitespace-pre-wrap">{message.error}</span>
            </div>
            {message.parentId && (
              <Marginalia onClick={retry}>Retry</Marginalia>
            )}
          </div>
        )}
        {citations.length > 0 && <Citations citations={citations} />}
      </div>

      {!streaming && (
        <div className={cn('mt-3 flex items-center gap-4', INDENT)}>
          <SiblingSwitcher message={message} allMessages={siblings} />
          <MessageActions message={message} allMessages={siblings} />
        </div>
      )}
    </article>
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
    <article className="flex flex-col">
      <header className="flex items-center gap-3">
        <RoleTag role="user" />
      </header>
      <div className={cn('mt-3', INDENT)}>
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
              (e.ctrlKey || e.metaKey) &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void save();
            }
          }}
          className="block max-h-60 min-h-9 w-full resize-none border border-input bg-card px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2 flex items-center gap-4">
          <Marginalia onClick={() => void save()} disabled={!value.trim()}>
            Save
          </Marginalia>
          <Marginalia onClick={onClose}>Cancel</Marginalia>
        </div>
      </div>
    </article>
  );
}
