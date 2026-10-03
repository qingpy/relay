import { ChevronLeft, ChevronRight } from 'lucide-react';
import { setCurrentLeaf, updateMessage } from '@/db/repo';
import type { Message } from '@/db/types';
import { roleSiblings, switchSibling } from '@/lib/tree';

/**
 * `‹ 2/3 ›` on the active turn. User siblings are Branch forks (new input
 * under the same assistant); assistant siblings are regenerated replies.
 * After Clear, ‹ n/m › in the stitched history restitches that path and
 * keeps the divider.
 */
export function SiblingSwitcher({
  message,
  allMessages,
  currentLeafId,
}: {
  message: Message;
  allMessages: Message[];
  currentLeafId?: string;
}) {
  const sibs = roleSiblings(allMessages, message);
  if (sibs.length < 2) return null;

  const index = sibs.findIndex((m) => m.id === message.id);
  const go = (i: number) => {
    const next = switchSibling(
      allMessages,
      currentLeafId,
      message,
      sibs[i],
    );
    if ('stitchFrom' in next) {
      void updateMessage(next.stitchFrom.dividerId, {
        clearedFromId: next.stitchFrom.clearedFromId,
      });
      return;
    }
    void setCurrentLeaf(message.sessionId, next.leafId);
  };

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
