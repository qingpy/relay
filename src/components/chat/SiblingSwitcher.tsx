import { ChevronLeft, ChevronRight } from 'lucide-react';
import { setCurrentLeaf } from '@/db/repo';
import type { Message } from '@/db/types';
import { leafOf, roleSiblings } from '@/lib/tree';

/**
 * `‹ 2/3 ›` on the active turn. User siblings are Branch forks (new input
 * under the same assistant); assistant siblings are regenerated replies.
 */
export function SiblingSwitcher({
  message,
  allMessages,
}: {
  message: Message;
  allMessages: Message[];
}) {
  const sibs = roleSiblings(allMessages, message);
  if (sibs.length < 2) return null;

  const index = sibs.findIndex((m) => m.id === message.id);
  const go = (i: number) =>
    void setCurrentLeaf(message.sessionId, leafOf(allMessages, sibs[i].id));

  const kind = message.role === 'user' ? 'branch' : 'reply';

  return (
    <div className="label-mono flex select-none items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={index <= 0}
        aria-label={`Previous ${kind}`}
        className="flex size-4 items-center justify-center transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="tabular-nums">
        {index + 1}/{sibs.length}
      </span>
      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={index >= sibs.length - 1}
        aria-label={`Next ${kind}`}
        className="flex size-4 items-center justify-center transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
