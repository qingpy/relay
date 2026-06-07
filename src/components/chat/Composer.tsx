import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
import { clearContext, listPrompts } from '@/db/repo';
import type { Prompt } from '@/db/types';
import {
  FULL_CAPS,
  acceptFor,
  filesFromClipboard,
  partitionAllowed,
} from '@/lib/attachments';
import { startNewSession } from '@/lib/session-actions';
import { useResolvedConfig } from '@/lib/useResolved';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat';
import { AttachmentChip, useRefusedNote } from './AttachmentChip';
import { SlashPalette } from './SlashPalette';

export function Composer({ sessionId }: { sessionId: string | null }) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refusedNote, reportRefused] = useRefusedNote();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const prompts = useLiveQuery(() => listPrompts(), [], []);
  const resolved = useResolvedConfig(sessionId);
  const streaming = useChatStore((s) =>
    sessionId ? !!s.activeBySession[sessionId] : false,
  );
  const caps = resolved?.capabilities ?? FULL_CAPS;

  const slashQuery =
    value.startsWith('/') && !value.includes('\n') ? value.slice(1) : null;
  const q = slashQuery?.toLowerCase() ?? '';
  const matches =
    slashQuery !== null
      ? prompts.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q),
        )
      : [];
  const paletteOpen = slashQuery !== null && matches.length > 0 && !dismissed;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) {
      // Fixed tall editor (~half the viewport), regardless of content length.
      el.style.height = `${Math.round(window.innerHeight * 0.5)}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value, expanded]);

  const addFiles = (list: FileList | File[]) => {
    const { accepted, refused } = partitionAllowed(list, caps);
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
    reportRefused(refused);
  };

  // Attach files pasted from the clipboard while letting plain-text paste
  // through untouched.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = filesFromClipboard(e.clipboardData);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const onChange = (next: string) => {
    setValue(next);
    setActiveIndex(0);
    setDismissed(false);
  };

  const insertPrompt = (prompt: Prompt) => {
    setValue(prompt.content);
    setDismissed(true);
    ref.current?.focus();
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && files.length === 0) || streaming) return;
    const sending = files;
    setValue('');
    setFiles([]);
    const sid = sessionId ?? (await startNewSession()).id;
    await useChatStore.getState().send(sid, text, sending);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        insertPrompt(matches[activeIndex]);
        return;
      }
    }
    // Send with Ctrl/⌘+Enter; a plain Enter just inserts a newline.
    if (
      e.key === 'Enter' &&
      (e.ctrlKey || e.metaKey) &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-border bg-card">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'relative mx-auto w-full max-w-3xl px-6 py-5',
          dragOver && 'ring-2 ring-inset ring-primary',
        )}
      >
        {paletteOpen && (
          <SlashPalette
            prompts={matches}
            activeIndex={activeIndex}
            onSelect={insertPrompt}
          />
        )}

        {(files.length > 0 || refusedNote) && (
          <div className="mb-1 flex flex-wrap items-center gap-2 px-1 pt-1">
            {files.map((f, i) => (
              <AttachmentChip
                key={`${f.name}-${i}`}
                name={f.name}
                mimeType={f.type}
                blob={f}
                onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
            {refusedNote && (
              <span className="label-mono text-muted-foreground">{refusedNote}</span>
            )}
          </div>
        )}

        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Message…   / for prompts"
          spellCheck
          lang="en"
          className="block min-h-9 w-full resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        <div className="mt-4 flex items-center gap-6 px-1">
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
          <Marginalia onClick={() => fileInput.current?.click()}>Attach</Marginalia>
          <Marginalia onClick={() => setExpanded((v) => !v)} active={expanded}>
            {expanded ? 'Shrink' : 'Expand'}
          </Marginalia>
          {sessionId && (
            <Marginalia onClick={() => void clearContext(sessionId)}>
              Clear
            </Marginalia>
          )}
          <div className="ml-auto" />
          {streaming ? (
            <button
              type="button"
              onClick={() => sessionId && useChatStore.getState().stop(sessionId)}
              className="cursor-pointer px-2 font-mono text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-foreground"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!value.trim() && files.length === 0}
              className="cursor-pointer px-2 font-mono text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-foreground disabled:pointer-events-none disabled:text-muted-foreground/40"
            >
              Send
            </button>
          )}
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/5 text-sm font-medium text-primary">
            Drop files to attach
          </div>
        )}
      </div>
    </div>
  );
}
