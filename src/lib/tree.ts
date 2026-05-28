import type { Message } from '@/db/types';

/** Children of a message (or roots when id is null), ordered by createdAt. */
export function childrenOf(messages: Message[], id: string | null): Message[] {
  return messages
    .filter((m) => m.parentId === id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Descend from a node following the newest child each step to reach a leaf. */
export function leafOf(messages: Message[], startId: string): string {
  let id = startId;
  for (;;) {
    const kids = childrenOf(messages, id);
    if (kids.length === 0) return id;
    id = kids[kids.length - 1].id;
  }
}

/** Pick a default leaf: the most recently created message overall. */
function defaultLeaf(messages: Message[]): string | undefined {
  let leaf: Message | undefined;
  for (const m of messages) if (!leaf || m.createdAt > leaf.createdAt) leaf = m;
  return leaf?.id;
}

/**
 * The active conversation: the path from the root down to `leafId`
 * (or a sensible default), in display order.
 */
export function activePath(messages: Message[], leafId?: string): Message[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  let cursor =
    leafId && byId.has(leafId) ? leafId : defaultLeaf(messages);

  const path: Message[] = [];
  const seen = new Set<string>();
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    const m = byId.get(cursor)!;
    path.push(m);
    cursor = m.parentId ?? undefined;
  }
  return path.reverse();
}

/** Siblings of a message (children of its parent), for the alternate switcher. */
export function siblingsOf(messages: Message[], message: Message): Message[] {
  return childrenOf(messages, message.parentId);
}
