import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Marginalia } from '@/components/ui/marginalia';
import { confirmMessageDelete } from '@/components/ui/confirm';
import { forkAsideChat, spliceMessage } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText } from '@/lib/conversation';
import { useChatStore } from '@/store/chat';
import { useUiStore } from '@/store/ui';

const Markdown = lazy(() =>
  import('./Markdown').then((m) => ({ default: m.Markdown })),
);

/**
 * A /btw exchange in the chat list: saved on the page, omitted from the
 * model context and the map. Click the card to expand; click outside to fold.
 */
export function AsideThread({
  user,
  assistant,
}: {
  user: Message;
  assistant?: Message;
}) {
  const [folded, setFolded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const buffer = useChatStore((s) =>
    assistant ? s.streams[assistant.id] : undefined,
  );
  const streaming = !!buffer;
  const answer = streaming
    ? buffer.text
    : assistant
      ? partsText(assistant.content)
      : '';
  const error = assistant?.error;
  const question = partsText(user.content);
  const thinking = streaming && !answer;
  const canFork = !!question && !!answer && !streaming;

  useEffect(() => {
    if (streaming) setFolded(false);
  }, [streaming]);

  useEffect(() => {
    if (folded || streaming) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setFolded(true);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [folded, streaming]);

  const fork = async () => {
    const created = await forkAsideChat(user.sessionId, {
      question,
      answer,
      model: assistant?.model,
    });
    if (!created) return;
    useUiStore.getState().setActiveSession(created.id);
    if (created.folderId) useUiStore.getState().setActivePreset(created.folderId);
  };

  const remove = async () => {
    const n = assistant ? 2 : 1;
    if (!(await confirmMessageDelete(n))) return;
    if (assistant) await spliceMessage(assistant.id, { force: true });
    await spliceMessage(user.id, { force: true });
  };

  return (
    <div
      ref={box}
      onClick={() => {
        if (folded) setFolded(false);
      }}
      className={
        folded
          ? 'cursor-pointer overflow-hidden border border-border bg-muted/40'
          : 'overflow-hidden border border-border bg-muted/40'
      }
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="label-mono text-primary">Aside</span>
        {folded && (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {question.replace(/\s+/g, ' ')}
          </span>
        )}
        {!folded && <span className="min-w-0 flex-1" />}
        {streaming && (
          <Marginalia
            onClick={(e) => {
              e.stopPropagation();
              useChatStore.getState().stopAside(user.sessionId);
            }}
          >
            Stop
          </Marginalia>
        )}
        <Marginalia
          onClick={(e) => {
            e.stopPropagation();
            void fork();
          }}
          disabled={!canFork}
        >
          Fork
        </Marginalia>
        <Marginalia
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          disabled={streaming}
        >
          Delete
        </Marginalia>
      </div>
      {!folded && (
        <div className="border-t border-border px-3 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{question}</p>
          {thinking && (
            <p className="label-mono mt-2 animate-pulse text-primary">Thinking</p>
          )}
          {answer ? (
            <div className="mt-2">
              <Suspense
                fallback={<div className="md whitespace-pre-wrap">{answer}</div>}
              >
                <Markdown>{answer}</Markdown>
              </Suspense>
            </div>
          ) : null}
          {error && (
            <p className="mt-2 whitespace-pre-wrap text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
