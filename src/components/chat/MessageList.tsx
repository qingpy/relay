import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckSquare } from '@/components/ui/check-square';
import { getMessages, getSession } from '@/db/repo';
import type { Message } from '@/db/types';
import { activePath } from '@/lib/tree';
import { cn, rangeBetween } from '@/lib/utils';
import { useChatStore } from '@/store/chat';
import { useUiStore } from '@/store/ui';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './SelectionToolbar';

export function MessageList({ sessionId }: { sessionId: string }) {
  const all = useLiveQuery(() => getMessages(sessionId), [sessionId], []);
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  const messages = useMemo(
    () => activePath(all, session?.currentLeafId),
    [all, session?.currentLeafId],
  );

  const selectionMode = useUiStore((s) => s.selectionMode);
  const selected = useUiStore((s) => s.selected);
  const setMessageSelected = useUiStore((s) => s.setMessageSelected);
  const addSelection = useUiStore((s) => s.addSelection);
  const locateId = useUiStore((s) => s.locateId);
  const requestLocate = useUiStore((s) => s.requestLocate);
  const [flashId, setFlashId] = useState<string | null>(null);

  const activeId = useChatStore((s) => s.activeBySession[sessionId]);
  const streamLen = useChatStore((s) => {
    if (!activeId) return 0;
    const b = s.streams[activeId];
    return b ? b.text.length + b.reasoning.length : 0;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Anchor for shift-range selection (the last plainly-clicked message).
  const anchorRef = useRef<string | null>(null);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // A new chat always opens stuck to its latest message — the ref survives
  // session switches, so a scrolled-up position would otherwise carry over.
  useEffect(() => {
    stick.current = true;
  }, [sessionId]);

  useEffect(() => {
    // Don't yank to the bottom while we're trying to land on a specific message.
    const el = scrollRef.current;
    if (el && stick.current && !locateId) el.scrollTop = el.scrollHeight;
  }, [messages, streamLen, locateId]);

  // Scroll to a message requested from the branch map. The target may not be on
  // the active path yet (the map switches the branch first), so we wait — when
  // `messages` updates to include it, this re-runs, finds it, and scrolls.
  useEffect(() => {
    if (!locateId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-mid="${locateId}"]`,
    );
    if (!el) return;
    stick.current = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(locateId);
    requestLocate(null);
  }, [locateId, messages, requestLocate]);

  // Fade the located-message highlight out on its own timer.
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(t);
  }, [flashId]);

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

  const selectableIds = useMemo(
    () => messages.filter((m) => m.role !== 'divider').map((m) => m.id),
    [messages],
  );

  // Reset the range anchor whenever selection mode is entered/left.
  useEffect(() => {
    anchorRef.current = null;
  }, [selectionMode]);

  // Click toggles one message; shift-click extends the selection to cover the
  // whole run between the anchor and the clicked message (Explorer-style).
  const selectAt = (id: string, shift: boolean) => {
    const range = shift ? rangeBetween(selectableIds, anchorRef.current, id) : null;
    if (range) addSelection(range);
    else setMessageSelected(id, !selected[id]);
    anchorRef.current = id;
  };

  return (
    <div className="relative min-h-0 flex-1">
      {selectionMode && (
        <SelectionToolbar messages={messages} selectableIds={selectableIds} />
      )}
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
          {messages.map((m) =>
            selectionMode && m.role !== 'divider' ? (
              <SelectableRow
                key={m.id}
                message={m}
                checked={!!selected[m.id]}
                onSelect={(shift) => selectAt(m.id, shift)}
              >
                <MessageItem message={m} siblings={all} />
              </SelectableRow>
            ) : (
              <div
                key={m.id}
                data-role={m.role}
                data-mid={m.id}
                className={cn(
                  'transition-shadow duration-700',
                  flashId === m.id && 'ring-2 ring-primary/40',
                )}
              >
                <MessageItem message={m} siblings={all} />
              </div>
            ),
          )}
        </div>
      </div>

      {messages.length > 2 && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 border border-border bg-card/90 p-1 backdrop-blur">
          <NavButton onClick={jumpTop} label="First message">
            <ChevronsUp />
          </NavButton>
          <NavButton onClick={prevUser} label="Previous turn">
            <ChevronUp />
          </NavButton>
          <NavButton onClick={nextUser} label="Next turn">
            <ChevronDown />
          </NavButton>
          <NavButton onClick={jumpBottom} label="Latest message">
            <ChevronsDown />
          </NavButton>
        </div>
      )}
    </div>
  );
}

function SelectableRow({
  message,
  checked,
  onSelect,
  children,
}: {
  message: Message;
  checked: boolean;
  onSelect: (shift: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-role={message.role}
      data-mid={message.id}
      onClick={(e) => onSelect(e.shiftKey)}
      className={cn(
        'flex cursor-pointer select-none gap-3 p-2 transition-colors',
        checked
          ? 'bg-primary/5 ring-1 ring-inset ring-primary/30'
          : 'hover:bg-accent/40',
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(e.shiftKey);
        }}
        role="checkbox"
        aria-checked={checked}
        className="mt-1"
      >
        <CheckSquare checked={checked} />
      </button>
      <div className="pointer-events-none min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
      {children}
    </Button>
  );
}
