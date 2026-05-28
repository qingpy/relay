import { useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  // --- Long-chat navigation ---
  const userTops = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return [];
    const base = el.getBoundingClientRect().top - el.scrollTop;
    return [...el.querySelectorAll('[data-role="user"]')].map(
      (n) => n.getBoundingClientRect().top - base,
    );
  }, []);

  const scrollTo = (top: number) =>
    scrollRef.current?.scrollTo({ top, behavior: 'smooth' });

  const jumpTop = useCallback(() => scrollTo(0), []);
  const jumpBottom = useCallback(
    () => scrollTo(scrollRef.current?.scrollHeight ?? 0),
    [],
  );
  const prevUser = useCallback(() => {
    const cur = scrollRef.current?.scrollTop ?? 0;
    const tops = userTops().filter((t) => t < cur - 4);
    if (tops.length) scrollTo(tops[tops.length - 1]);
    else jumpTop();
  }, [userTops, jumpTop]);
  const nextUser = useCallback(() => {
    const cur = scrollRef.current?.scrollTop ?? 0;
    const next = userTops().find((t) => t > cur + 4);
    if (next != null) scrollTo(next);
    else jumpBottom();
  }, [userTops, jumpBottom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === 'TEXTAREA' || t?.tagName === 'INPUT';
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        prevUser();
      } else if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        nextUser();
      } else if (e.ctrlKey && e.key === 'Home' && !typing) {
        e.preventDefault();
        jumpTop();
      } else if (e.ctrlKey && e.key === 'End' && !typing) {
        e.preventDefault();
        jumpBottom();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevUser, nextUser, jumpTop, jumpBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((m) => (
            <div key={m.id} data-role={m.role}>
              <MessageItem message={m} />
            </div>
          ))}
        </div>
      </div>

      {messages.length > 2 && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-border bg-card/90 p-1 shadow-sm backdrop-blur">
          <NavButton onClick={jumpTop} title="First (Ctrl+Home)">
            <ChevronsUp />
          </NavButton>
          <NavButton onClick={prevUser} title="Previous turn (Alt+↑)">
            <ChevronUp />
          </NavButton>
          <NavButton onClick={nextUser} title="Next turn (Alt+↓)">
            <ChevronDown />
          </NavButton>
          <NavButton onClick={jumpBottom} title="Latest (Ctrl+End)">
            <ChevronsDown />
          </NavButton>
        </div>
      )}
    </div>
  );
}

function NavButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} title={title}>
      {children}
    </Button>
  );
}
