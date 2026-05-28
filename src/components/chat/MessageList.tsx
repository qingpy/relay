import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMessages } from '@/db/repo';
import { useChatStore } from '@/store/chat';
import { MessageItem } from './MessageItem';

export function MessageList({ sessionId }: { sessionId: string }) {
  const messages = useLiveQuery(() => getMessages(sessionId), [sessionId], []);

  const activeId = useChatStore((s) => s.activeBySession[sessionId]);
  const streamLen = useChatStore((s) => {
    if (!activeId) return 0;
    const b = s.streams[activeId];
    return b ? b.text.length + b.reasoning.length : 0;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamLen]);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}
