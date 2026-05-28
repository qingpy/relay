import { ChevronLeft, ChevronRight } from 'lucide-react';
import { setCurrentLeaf } from '@/db/repo';
import type { Message } from '@/db/types';
import { leafOf, siblingsOf } from '@/lib/tree';

/** `‹ 2/3 ›` switcher shown on messages that have alternate branches. */
export function SiblingSwitcher({
  message,
  allMessages,
}: {
  message: Message;
  allMessages: Message[];
}) {
  const sibs = siblingsOf(allMessages, message);
  if (sibs.length < 2) return null;

  const index = sibs.findIndex((m) => m.id === message.id);
  const go = (i: number) =>
    void setCurrentLeaf(message.sessionId, leafOf(allMessages, sibs[i].id));

  return (
    <div className="flex select-none items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={index <= 0}
        title="Previous branch"
        className="flex size-5 items-center justify-center rounded transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span>
        {index + 1}/{sibs.length}
      </span>
      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={index >= sibs.length - 1}
        title="Next branch"
        className="flex size-5 items-center justify-center rounded transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
