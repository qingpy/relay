import type { Message } from '@/db/types';

/** Children of a message (or roots when id is null), ordered by createdAt. */
export function childrenOf(messages: Message[], id: string | null): Message[] {
  const parent = id ?? null;
  return messages
    .filter((m) => (m.parentId ?? null) === parent)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** How many live leaves sit in this node's subtree (deleted stubs count 0). */
export function descendantLeafCount(messages: Message[], id: string): number {
  const kids = childrenOf(messages, id);
  if (kids.length === 0) {
    const self = messages.find((m) => m.id === id);
    return self?.deletedAt ? 0 : 1;
  }
  let n = 0;
  for (const k of kids) n += descendantLeafCount(messages, k.id);
  return n;
}

/** Same-role children of this message's parent, including the message itself. */
export function roleSiblings(messages: Message[], msg: Message): Message[] {
  return childrenOf(messages, msg.parentId).filter((m) => m.role === msg.role);
}

/** True if this turn is a live ‹ n/m › variant or an ancestor of more than one leaf. */
export function hasOtherBranches(messages: Message[], msg: Message): boolean {
  if (descendantLeafCount(messages, msg.id) > 1) return true;
  return roleSiblings(messages, msg).some(
    (m) => m.id !== msg.id && !m.deletedAt,
  );
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

/** Pick a default leaf: newest live message, else newest overall. */
function defaultLeaf(messages: Message[]): string | undefined {
  let leaf: Message | undefined;
  for (const m of messages) {
    if (m.deletedAt) continue;
    if (!leaf || m.createdAt > leaf.createdAt) leaf = m;
  }
  if (leaf) return leaf.id;
  for (const m of messages)
    if (!leaf || m.createdAt > leaf.createdAt) leaf = m;
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

/**
 * A linear stretch from a fork head (or root) until the next fork, a divider,
 * or a leaf. Dividers are their own one-message segments so they stay selectable.
 */
export interface Segment {
  id: string;
  messages: Message[];
  children: Segment[];
}

/** Children with deleted placeholders skipped (their kids lift up). Map only. */
function visibleChildren(messages: Message[], id: string | null): Message[] {
  const out: Message[] = [];
  for (const k of childrenOf(messages, id)) {
    if (k.deletedAt) out.push(...visibleChildren(messages, k.id));
    else out.push(k);
  }
  return out;
}

function segmentFrom(
  messages: Message[],
  start: Message,
): { chain: Message[]; next: Message[] } {
  if (start.role === 'divider') {
    return { chain: [start], next: visibleChildren(messages, start.id) };
  }
  const chain = [start];
  let cur = start;
  for (;;) {
    const kids = visibleChildren(messages, cur.id);
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
  return visibleChildren(messages, null).map(build);
}

/** Newest visible descendant — Map Show must not land on a hidden tombstone. */
export function visibleLeafOf(messages: Message[], startId: string): string {
  let id = startId;
  for (;;) {
    const kids = visibleChildren(messages, id);
    if (kids.length === 0) return id;
    id = kids[kids.length - 1].id;
  }
}
