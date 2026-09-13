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

/**
 * A linear stretch from a fork head (or root) until the next fork, a divider,
 * or a leaf. Dividers are their own one-message segments so they stay selectable.
 */
export interface Segment {
  id: string;
  messages: Message[];
  children: Segment[];
}

function segmentFrom(
  messages: Message[],
  start: Message,
): { chain: Message[]; next: Message[] } {
  if (start.role === 'divider') {
    return { chain: [start], next: childrenOf(messages, start.id) };
  }
  const chain = [start];
  let cur = start;
  for (;;) {
    const kids = childrenOf(messages, cur.id);
    if (kids.length === 1 && kids[0].role !== 'divider') {
      cur = kids[0];
      chain.push(cur);
    } else {
      return { chain, next: kids };
    }
  }
}

/** Forest of compressed branches for the map. */
export function segmentTree(messages: Message[]): Segment[] {
  const build = (head: Message): Segment => {
    const { chain, next } = segmentFrom(messages, head);
    return { id: head.id, messages: chain, children: next.map(build) };
  };
  return childrenOf(messages, null).map(build);
}
