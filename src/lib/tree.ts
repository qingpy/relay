import type { Message } from '@/db/types';

/** Children of a message (or roots when id is null), ordered by createdAt.
 *  Aside turns hang off the same parent but are skipped unless `asides`. */
export function childrenOf(
  messages: Message[],
  id: string | null,
  opts?: { asides?: boolean },
): Message[] {
  const parent = id ?? null;
  return messages
    .filter((m) => (m.parentId ?? null) === parent)
    .filter((m) => (opts?.asides ? true : !m.aside))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Aside user/assistant hanging under `id` (and their aside replies).
 *  `id` null is forest-root asides (empty chat / wiped leaf). */
export function asidesUnder(
  messages: Message[],
  id: string | null,
): Message[] {
  const parent = id ?? null;
  const heads = messages
    .filter(
      (m) => m.aside && !m.deletedAt && (m.parentId ?? null) === parent,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  const out: Message[] = [];
  for (const h of heads) {
    out.push(h);
    out.push(...asidesUnder(messages, h.id));
  }
  return out;
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

/**
 * Where a new user turn attaches given `currentLeafId`.
 *
 * Live leaf (including a divider): the new user is its child.
 * Deleted user: sibling of that empty slot (`parentId = leaf.parentId`) so
 * ‹ n/m › with the live fork is preserved — never walk a deleted chain to
 * `null` (that plants a new forest root and drops the other fork off the path).
 * Deleted non-user (empty regenerated reply): stay on that variant so its
 * ‹ n/m › siblings remain on the path.
 * Missing leaf: no parent (treated as a new root).
 */
export function attachParentId(
  messages: Message[],
  leafId?: string | null,
): string | null {
  if (!leafId) return null;
  const leaf = messages.find((m) => m.id === leafId);
  if (!leaf) return null;
  if (!leaf.deletedAt) return leaf.id;
  if (leaf.role === 'user') return leaf.parentId ?? null;
  return leaf.id;
}

/** Deleted user with no live main-line children: an empty ‹ n/m › slot to fill.
 *  Aside turns are not slots (`childrenOf` skips them, so they would look empty). */
export function isEmptyUserSlot(messages: Message[], msg: Message): boolean {
  if (msg.aside || msg.role !== 'user' || !msg.deletedAt) return false;
  return !childrenOf(messages, msg.id).some((c) => !c.deletedAt);
}

/**
 * Leftover forest-root dividers (`parentId: null`) sit beside the tree they
 * cut. Reparent each onto that path so chat and map share one topology.
 */
export function reparentRootDividers(messages: Message[]): Message[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const patches = new Map<string, string>();
  for (const d of messages) {
    if (d.role !== 'divider' || d.deletedAt) continue;
    if ((d.parentId ?? null) !== null) continue;
    let parent: string | null =
      d.clearedFromId && byId.has(d.clearedFromId) && !byId.get(d.clearedFromId)?.aside
        ? d.clearedFromId
        : null;
    if (!parent) {
      let newest: Message | undefined;
      for (const m of messages) {
        if (m.id === d.id || m.role === 'divider' || m.aside) continue;
        if (m.createdAt > d.createdAt) continue;
        if (!newest || m.createdAt > newest.createdAt) newest = m;
      }
      parent = newest?.id ?? null;
    }
    if (!parent || parent === d.id) continue;
    let cur = byId.get(parent);
    const seen = new Set<string>();
    let cycle = false;
    while (cur) {
      if (cur.id === d.id) {
        cycle = true;
        break;
      }
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (!cycle) patches.set(d.id, parent);
  }
  if (patches.size === 0) return messages;
  return messages.map((m) => {
    const parentId = patches.get(m.id);
    return parentId !== undefined ? { ...m, parentId } : m;
  });
}

/** `reparentRootDividers` per session (import / snapshot). */
export function reparentRootDividersAll(messages: Message[]): Message[] {
  const sessions = new Map<string, Message[]>();
  for (const m of messages) {
    const g = sessions.get(m.sessionId);
    if (g) g.push(m);
    else sessions.set(m.sessionId, [m]);
  }
  let changed = false;
  const out: Message[] = [];
  for (const group of sessions.values()) {
    const next = reparentRootDividers(group);
    if (next !== group) changed = true;
    out.push(...next);
  }
  return changed ? out : messages;
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

/** Newest live message; `undefined` when the session has no live turns. */
export function liveLeafId(messages: Message[]): string | undefined {
  let leaf: Message | undefined;
  for (const m of messages) {
    if (m.deletedAt || m.aside) continue;
    if (!leaf || m.createdAt > leaf.createdAt) leaf = m;
  }
  return leaf?.id;
}

function defaultLeaf(messages: Message[]): string | undefined {
  return liveLeafId(messages);
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
    if (!m.aside) path.push(m);
    cursor = m.parentId ?? undefined;
  }
  return path.reverse();
}

/** Turns the model sees: after the latest divider on the path, then anything
 *  older than a divider anywhere in the session is dropped. Asides omitted. */
export function activeWindow(
  path: Message[],
  all: Message[] = path,
): Message[] {
  let start = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].role === 'divider' && !path[i].deletedAt) {
      start = i + 1;
      break;
    }
  }
  let window = path.slice(start).filter((m) => !m.aside);
  const cuts = all.filter((m) => m.role === 'divider' && !m.deletedAt);
  if (cuts.length) {
    const latest = cuts.reduce((a, b) =>
      a.createdAt >= b.createdAt ? a : b,
    );
    window = window.filter((m) => m.createdAt > latest.createdAt);
  }
  return window;
}

/** Model window on the active path — what an aside fork copies. */
export function copyablePath(messages: Message[], leafId?: string): Message[] {
  return activeWindow(activePath(messages, leafId), messages).filter(
    (m) =>
      !m.deletedAt && (m.role === 'user' || m.role === 'assistant'),
  );
}

/** Active path with aside threads inserted under the turns they hang from. */
export function displayPath(messages: Message[], leafId?: string): Message[] {
  const out: Message[] = [];
  const used = new Set<string>();
  const take = (a: Message) => {
    if (used.has(a.id)) return;
    out.push(a);
    used.add(a.id);
  };
  for (const a of asidesUnder(messages, null)) take(a);
  for (const m of activePath(messages, leafId)) {
    if (used.has(m.id)) continue;
    out.push(m);
    used.add(m.id);
    for (const a of asidesUnder(messages, m.id)) take(a);
  }
  return out;
}

/** A divider may be removed only when nothing sits beneath it — no descendants
 *  (another divider counts) and no later root-level tree. */
export function canDeleteDivider(messages: Message[], d: Message): boolean {
  if (d.role !== 'divider' || d.deletedAt) return false;
  if (childrenOf(messages, d.id).some((c) => !c.deletedAt)) return false;
  if ((d.parentId ?? null) !== null) return true;
  return !childrenOf(messages, null).some(
    (r) => !r.deletedAt && r.id !== d.id && r.createdAt > d.createdAt,
  );
}

/**
 * A linear stretch from a fork head (or root) until the next fork or a leaf.
 * Context-cleared dividers are lifted so they do not appear on the map.
 * Pin is a view mark, not a segment break.
 */
export interface Segment {
  id: string;
  messages: Message[];
  children: Segment[];
}

/** Children with deleted placeholders and context dividers skipped (kids lift). Map only. */
function visibleChildren(messages: Message[], id: string | null): Message[] {
  const out: Message[] = [];
  for (const k of childrenOf(messages, id)) {
    if (k.deletedAt || k.role === 'divider') {
      out.push(...visibleChildren(messages, k.id));
    } else out.push(k);
  }
  return out;
}

function segmentFrom(
  messages: Message[],
  start: Message,
): { chain: Message[]; next: Message[] } {
  const chain = [start];
  let cur = start;
  for (;;) {
    const kids = visibleChildren(messages, cur.id);
    if (kids.length === 1) {
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

/**
 * Messages that must stay after a splice: live turns, their ancestors, and
 * deleted ‹ n/m › siblings of live turns. Everything else is an orphan stub.
 */
export function retainMessageIds(messages: Message[]): Set<string> {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const keep = new Set<string>();
  for (const m of messages) {
    if (m.deletedAt) continue;
    if (m.role === 'divider') keep.add(m.id);
    let cur: Message | undefined = m;
    while (cur) {
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const sib of roleSiblings(messages, m)) keep.add(sib.id);
  }
  return keep;
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
