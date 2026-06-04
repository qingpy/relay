import { lazy, memo, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, X } from 'lucide-react';
import { Marginalia } from '@/components/ui/marginalia';
import type { Message, StoredFile } from '@/db/types';
import {
  deleteFiles,
  getFilesByIds,
  saveAttachments,
  spliceMessage,
  textPart,
  updateMessage,
} from '@/db/repo';
import {
  FULL_CAPS,
  acceptFor,
  filesFromClipboard,
  partitionAllowed,
} from '@/lib/attachments';
import { partsText } from '@/lib/conversation';
import { formatStamp } from '@/lib/time';
import { useResolvedConfig } from '@/lib/useResolved';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat';
import { AttachmentChip, useRefusedNote } from './AttachmentChip';
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
    <time dateTime={new Date(at).toISOString()}>{formatStamp(at)}</time>
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
          <MessageActions message={message} onEdit={() => setEditing(true)} />
        </div>
      </article>
    );
  }

  const showDots = streaming && !text && !reasoning && toolCalls.length === 0;
  // An assistant turn with no content and no recorded error is a stream that
  // never finished (page closed or killed mid-flight) — say so instead of
  // rendering a blank husk. The stream store and the live query update on
  // different schedules, so around a turn's start/finish a message can *look*
  // like this for a frame or two — `appear-late` keeps those transient mounts
  // from ever painting; only a husk that persists fades in.
  const interrupted =
    !streaming &&
    !text &&
    !reasoning &&
    toolCalls.length === 0 &&
    citations.length === 0 &&
    !message.error;
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
            durationMs={reasoningMs}
          />
        )}
        {toolCalls.map((tc, i) => (
          <ToolCard key={tc.id || i} call={tc} />
        ))}
        {text ? <MessageBody text={text} /> : showDots ? <StreamingDots /> : null}
        {interrupted && (
          <div className="appear-late label-mono flex items-center gap-4 text-muted-foreground">
            <span>No output — interrupted</span>
            {message.parentId && <Marginalia onClick={retry}>Retry</Marginalia>}
          </div>
        )}
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
          <MessageActions message={message} />
        </div>
      )}
    </article>
  );
});

/**
 * In-place editor for a user turn: text plus attachments. Existing files show
 * as removable chips; new files come in via Attach or paste (filtered by the
 * model's capabilities). Saving rewrites the message where it stands — replies
 * stay put; Regenerate picks up the new content.
 */
function UserEditor({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => partsText(message.content));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<File[]>([]);
  const [refusedNote, reportRefused] = useRefusedNote();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const existing = useLiveQuery(
    () => getFilesByIds(message.attachments ?? []),
    [message.id],
    [] as StoredFile[],
  );
  const resolved = useResolvedConfig(message.sessionId);
  const caps = resolved?.capabilities ?? FULL_CAPS;

  const kept = existing.filter((f) => !removed.has(f.id));
  const canSave = !!value.trim() || kept.length + added.length > 0;

  const addFiles = (list: FileList | File[]) => {
    const { accepted, refused } = partitionAllowed(list, caps);
    if (accepted.length) setAdded((prev) => [...prev, ...accepted]);
    reportRefused(refused);
  };

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
    if (!canSave) return;
    onClose();
    const text = value.trim();
    const changed = removed.size > 0 || added.length > 0;
    const newIds = added.length
      ? await saveAttachments(message.sessionId, message.id, added)
      : [];
    await updateMessage(message.id, {
      content: text ? [textPart(text)] : [],
      // A changed file set invalidates the measured token cost — clear it so
      // the next completed turn re-prices the attachments.
      ...(changed
        ? {
            attachments: [...kept.map((f) => f.id), ...newIds],
            fileTokens: undefined,
          }
        : {}),
    });
    if (removed.size) await deleteFiles([...removed]);
  };

  return (
    <article className="flex flex-col">
      <header className="flex items-center gap-3">
        <RoleTag role="user" />
      </header>
      <div className={cn('mt-3', INDENT)}>
        {(kept.length > 0 || added.length > 0 || refusedNote) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {kept.map((f) => (
              <AttachmentChip
                key={f.id}
                name={f.name}
                mimeType={f.mimeType}
                blob={f.blob}
                onRemove={() =>
                  setRemoved((prev) => new Set(prev).add(f.id))
                }
              />
            ))}
            {added.map((f, i) => (
              <AttachmentChip
                key={`${f.name}-${i}`}
                name={f.name}
                mimeType={f.type}
                blob={f}
                onRemove={() =>
                  setAdded((prev) => prev.filter((_, j) => j !== i))
                }
              />
            ))}
            {refusedNote && (
              <span className="label-mono text-muted-foreground">
                {refusedNote}
              </span>
            )}
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={(e) => {
            setValue(e.target.value);
            resize(e.target);
          }}
          onPaste={(e) => {
            const pasted = filesFromClipboard(e.clipboardData);
            if (pasted.length) {
              e.preventDefault();
              addFiles(pasted);
            }
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
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={acceptFor(caps)}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="mt-2 flex items-center gap-4">
          <Marginalia onClick={() => void save()} disabled={!canSave}>
            Save
          </Marginalia>
          <Marginalia onClick={() => fileInput.current?.click()}>
            Attach
          </Marginalia>
          <Marginalia onClick={onClose}>Cancel</Marginalia>
        </div>
      </div>
    </article>
  );
}
