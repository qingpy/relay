import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, X } from 'lucide-react';
import { Marginalia } from '@/components/ui/marginalia';
import {
  clearContext,
  getSession,
  listPrompts,
  setSessionWebSearch,
} from '@/db/repo';
import type { Prompt } from '@/db/types';
import { acceptFor, isAllowed } from '@/lib/attachments';
import { startNewSession } from '@/lib/session-actions';
import { useResolvedConfig } from '@/lib/useResolved';
import { cn } from '@/lib/utils';
import type { Capabilities } from '@/providers/types';
import { useChatStore } from '@/store/chat';
import { SlashPalette } from './SlashPalette';

const FULL_CAPS: Capabilities = {
  vision: true,
  pdf: true,
  reasoning: true,
  webSearch: true,
  toolUse: true,
};

export function Composer({ sessionId }: { sessionId: string | null }) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const session = useLiveQuery(
    () => (sessionId ? getSession(sessionId) : undefined),
    [sessionId],
  );
  const prompts = useLiveQuery(() => listPrompts(), [], []);
  const resolved = useResolvedConfig(sessionId);
  const streaming = useChatStore((s) =>
    sessionId ? !!s.activeBySession[sessionId] : false,
  );
  const webSearch = session?.webSearch ?? false;
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
    const incoming = [...list].filter((f) => isAllowed(f.type, f.name, caps));
    if (incoming.length) setFiles((prev) => [...prev, ...incoming]);
  };

  // Attach images pasted from the clipboard (e.g. screenshots), letting plain
  // text paste through untouched.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.items)
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f)
      .map((f) =>
        f.name
          ? f
          : new File([f], `pasted-${Date.now()}.${f.type.split('/')[1] || 'png'}`, {
              type: f.type,
            }),
      );
    if (images.length) {
      e.preventDefault();
      addFiles(images);
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
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        insertPrompt(matches[activeIndex]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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

        {files.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-2 px-1 pt-1">
            {files.map((f, i) => (
              <PendingChip
                key={`${f.name}-${i}`}
                file={f}
                onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
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
          <Marginalia
            onClick={() => fileInput.current?.click()}
            title="Attach files"
          >
            Attach
          </Marginalia>
          <Marginalia
            onClick={() => setExpanded((v) => !v)}
            active={expanded}
            title={expanded ? 'Shrink input' : 'Expand input'}
          >
            {expanded ? 'Shrink' : 'Expand'}
          </Marginalia>
          {sessionId && (
            <>
              {caps.webSearch && (
                <Marginalia
                  onClick={() => void setSessionWebSearch(sessionId, !webSearch)}
                  active={webSearch}
                  title={webSearch ? 'Web search on' : 'Web search off'}
                >
                  Web
                </Marginalia>
              )}
              <Marginalia
                onClick={() => void clearContext(sessionId)}
                title="Clear context"
              >
                Clear
              </Marginalia>
            </>
          )}
          <div className="ml-auto" />
          {streaming ? (
            <button
              type="button"
              onClick={() => sessionId && useChatStore.getState().stop(sessionId)}
              title="Stop generating"
              className="cursor-pointer px-2 font-mono text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-foreground"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!value.trim() && files.length === 0}
              title="Send (Enter)"
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

function PendingChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-1.5 border border-border bg-muted/50 py-1 pl-1.5 pr-1 text-xs">
      {isImage && url ? (
        <img src={url} alt="" className="size-7 object-cover" />
      ) : (
        <FileText className="size-4 text-muted-foreground" />
      )}
      <span className="max-w-32 truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        className="flex size-5 items-center justify-center text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
