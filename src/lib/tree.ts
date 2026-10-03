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
  const walk = (parent: string | null, seen: Set<string>): Message[] => {
    const heads = messages
      .filter(
        (m) =>
          m.aside &&
          !m.deletedAt &&
          (m.parentId ?? null) === parent &&
          !seen.has(m.id),
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    const out: Message[] = [];
    for (const h of heads) {
      seen.add(h.id);
      out.push(h);
      out.push(...walk(h.id, seen));
    }
    return out;
  };
  return walk(id ?? null, new Set());
}

/** How many live leaves sit in this node's subtree (deleted stubs count 0). */
export function descendantLeafCount(
  messages: Message[],
  id: string,
  seen: Set<string> = new Set(),
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const kids = childrenOf(messages, id);
  if (kids.length === 0) {
    const self = messages.find((m) => m.id === id);
    return self?.deletedAt ? 0 : 1;
  }
  let n = 0;
  for (const k of kids) n += descendantLeafCount(messages, k.id, seen);
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
 * Clear is a new forest-root trunk. Continuation-era dividers (parented under
 * the leaf they cut) are detached so the map shows that trunk beside the old
 * tree. `clearedFromId` remembers the leaf so the view can stitch history.
 */
export function detachClearDividers(messages: Message[]): Message[] {
  const ids = new Set<string>();
  for (const d of messages) {
    if (d.role !== 'divider' || d.deletedAt) continue;
    if ((d.parentId ?? null) === null) continue;
    ids.add(d.id);
  }
  if (ids.size === 0) return messages;
  return messages.map((m) => {
    if (!ids.has(m.id)) return m;
    const clearedFromId = m.clearedFromId ?? m.parentId ?? undefined;
    return {
      ...m,
      parentId: null,
      ...(clearedFromId ? { clearedFromId } : {}),
    };
  });
}

/**
 * ‹ n/m › target. In stitched history, restitch the divider that sits
 * immediately after that turn (the Clear that cut that segment). On the
 * live tail after the last divider, walk to that sibling's leaf.
 */
export function switchSibling(
  messages: Message[],
  currentLeafId: string | undefined,
  from: Message,
  sib: Message,
):
  | { leafId: string }
  | { stitchFrom: { dividerId: string; clearedFromId: string } } {
  const view = stitchedMain(messages, currentLeafId);
  const fromIdx = view.findIndex((m) => m.id === from.id);
  const nextDiv =
    fromIdx >= 0
      ? view
          .slice(fromIdx + 1)
          .find((m) => m.role === 'divider' && !m.deletedAt)
      : undefined;
  if (nextDiv) {
    return {
      stitchFrom: {
        dividerId: nextDiv.id,
        clearedFromId: leafOf(messages, sib.id),
      },
    };
  }
  return { leafId: leafOf(messages, sib.id) };
}

/** True if this turn is a live ‹ n/m › variant or an ancestor of more than one leaf.
 *  Dividers are not ‹ n/m › — two forest-root Clears are parallel trunks. */
export function hasOtherBranches(messages: Message[], msg: Message): boolean {
  if (msg.role === 'divider') {
    return childrenOf(messages, msg.id, { asides: true }).some(
      (c) => !c.deletedAt,
    );
  }
  if (descendantLeafCount(messages, msg.id) > 1) return true;
  return roleSiblings(messages, msg).some(
    (m) => m.id !== msg.id && !m.deletedAt,
  );
}

/** Descend from a node following the newest child each step to reach a leaf. */
export function leafOf(messages: Message[], startId: string): string {
  const seen = new Set<string>();
  let id = startId;
  for (;;) {
    if (seen.has(id)) return id;
    seen.add(id);
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

/** Turns the model sees: after the latest divider on this path. A Clear on
 *  another branch does not empty this window — branching a pre-clear turn
 *  continues that trunk with its history. Asides omitted. */
export function activeWindow(path: Message[]): Message[] {
  let start = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].role === 'divider' && !path[i].deletedAt) {
      start = i + 1;
      break;
    }
  }
  return path.slice(start).filter((m) => !m.aside);
}

/** Model window on the active path — what an aside fork copies. */
export function copyablePath(messages: Message[], leafId?: string): Message[] {
  return activeWindow(activePath(messages, leafId)).filter(
    (m) =>
      !m.deletedAt && (m.role === 'user' || m.role === 'assistant'),
  );
}

/** Parent walk to `id` with no defaultLeaf fallback (missing id → []). */
function strictPath(messages: Message[], id: string): Message[] {
  const byId = new Map<string, Message>(messages.map((x) => [x.id, x]));
  if (!byId.has(id)) return [];
  const path: Message[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = id;
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    const row: Message = byId.get(cursor)!;
    if (!row.aside) path.push(row);
    cursor = row.parentId ?? undefined;
  }
  return path.reverse();
}

function previousDivider(messages: Message[], d: Message): Message | undefined {
  let best: Message | undefined;
  for (const m of messages) {
    if (m.sessionId !== d.sessionId) continue;
    if (m.role !== 'divider' || m.deletedAt || m.id === d.id) continue;
    if (m.createdAt >= d.createdAt) continue;
    if (!best || m.createdAt > best.createdAt) best = m;
  }
  return best;
}

/** Dividers whose `clearedFromId` is gone point at the previous Clear. */
export function sanitizeClearRefs(messages: Message[]): Message[] {
  const exist = new Set(messages.map((m) => m.id));
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== 'divider' || !m.clearedFromId) return m;
    if (exist.has(m.clearedFromId)) return m;
    const clearedFromId = previousDivider(messages, m)?.id;
    changed = true;
    return { ...m, clearedFromId };
  });
  return changed ? next : messages;
}

/** After a splice: dividers that remembered `goneId` point at `fallbackId`
 *  or the previous Clear. */
export function retargetClearedFrom(
  messages: Message[],
  goneId: string,
  fallbackId?: string | null,
): Message[] {
  const exist = new Set(messages.map((m) => m.id));
  const fb =
    fallbackId && exist.has(fallbackId) && fallbackId !== goneId
      ? fallbackId
      : undefined;
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== 'divider' || m.clearedFromId !== goneId) return m;
    const clearedFromId = fb ?? previousDivider(messages, m)?.id;
    if (clearedFromId === m.clearedFromId) return m;
    changed = true;
    return { ...m, clearedFromId };
  });
  return changed ? next : messages;
}

/** Main-line view for a leaf: each Clear prepends the full stitched history
 *  of the leaf it cut, so multiple Clears stack every previous chat.
 *  A missing `clearedFromId` (spliced middle) falls back to the previous
 *  Clear instead of `defaultLeaf`, which would recurse into this trunk. */
export function stitchedMain(
  messages: Message[],
  leafId?: string,
): Message[] {
  const used = new Set<string>();
  const walking = new Set<string>();
  const take = (nodes: Message[]): Message[] => {
    const out: Message[] = [];
    for (const m of nodes) {
      if (used.has(m.id)) continue;
      used.add(m.id);
      out.push(m);
    }
    return out;
  };
  const walk = (id: string | undefined, fallback: boolean): Message[] => {
    if (id && walking.has(id)) return [];
    if (id) walking.add(id);
    const path = fallback
      ? activePath(messages, id)
      : id
        ? strictPath(messages, id)
        : [];
    let dIdx = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].role === 'divider' && !path[i].deletedAt) {
        dIdx = i;
        break;
      }
    }
    if (dIdx < 0) return take(path);
    const d = path[dIdx];
    if (used.has(d.id)) return take(path.slice(dIdx));
    const byId = new Map(messages.map((m) => [m.id, m]));
    let from = d.clearedFromId && byId.has(d.clearedFromId)
      ? d.clearedFromId
      : undefined;
    if (!from) from = previousDivider(messages, d)?.id;
    const prefix = from ? walk(from, false) : [];
    return [...prefix, ...take(path.slice(dIdx))];
  };
  return walk(leafId, true);
}

/** Chat view: asides plus `stitchedMain`. Branch / map onto an old tree is
 *  that path alone (no divider; history goes to the model). */
export function displayPath(messages: Message[], leafId?: string): Message[] {
  const out: Message[] = [];
  const used = new Set<string>();
  const take = (a: Message) => {
    if (used.has(a.id)) return;
    out.push(a);
    used.add(a.id);
  };
  for (const a of asidesUnder(messages, null)) take(a);
  for (const m of stitchedMain(messages, leafId)) {
    if (used.has(m.id)) continue;
    out.push(m);
    used.add(m.id);
    for (const a of asidesUnder(messages, m.id)) take(a);
  }
  return out;
}

/** A divider may be removed only when nothing sits beneath it (asides count). */
export function canDeleteDivider(messages: Message[], d: Message): boolean {
  if (d.role !== 'divider' || d.deletedAt) return false;
  return !childrenOf(messages, d.id, { asides: true }).some((c) => !c.deletedAt);
}

/**
 * A linear stretch from a fork head (or root) until the next fork or a leaf.
 * Context-cleared dividers are omitted; their kids become first-level trees.
 * Pin is a view mark, not a segment break.
 */
export interface Segment {
  id: string;
  messages: Message[];
  children: Segment[];
}

/** Deleted stubs lift in place. Dividers do not: their kids are collected as
 *  forest roots in `segmentTree`, so an empty Clear does not appear on the map. */
function visibleChildren(
  messages: Message[],
  id: string | null,
  seen: Set<string> = new Set(),
): Message[] {
  const out: Message[] = [];
  for (const k of childrenOf(messages, id)) {
    if (seen.has(k.id)) continue;
    seen.add(k.id);
    if (k.deletedAt) out.push(...visibleChildren(messages, k.id, seen));
    else if (k.role !== 'divider') out.push(k);
  }
  return out;
}

function segmentFrom(
  messages: Message[],
  start: Message,
): { chain: Message[]; next: Message[] } {
  const chain = [start];
  const seen = new Set<string>([start.id]);
  let cur = start;
  for (;;) {
    const kids = visibleChildren(messages, cur.id);
    if (kids.length === 1 && !seen.has(kids[0].id)) {
      cur = kids[0];
      seen.add(cur.id);
      chain.push(cur);
    } else {
      return { chain, next: kids.filter((k) => !seen.has(k.id)) };
    }
  }
}

/** Forest of compressed branches for the map. */
export function segmentTree(messages: Message[]): Segment[] {
  const build = (head: Message): Segment => {
    const { chain, next } = segmentFrom(messages, head);
    return { id: head.id, messages: chain, children: next.map(build) };
  };
  const heads: Message[] = [];
  const seen = new Set<string>();
  const take = (m: Message) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    heads.push(m);
  };
  for (const m of visibleChildren(messages, null)) take(m);
  const dividers = messages
    .filter((m) => m.role === 'divider' && !m.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const d of dividers) {
    for (const k of visibleChildren(messages, d.id)) take(k);
  }
  return heads.map(build);
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
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const sib of roleSiblings(messages, m)) keep.add(sib.id);
  }
  return keep;
}

/** Newest visible descendant — Map Show must not land on a hidden tombstone. */
export function visibleLeafOf(messages: Message[], startId: string): string {
  const seen = new Set<string>();
  let id = startId;
  for (;;) {
    if (seen.has(id)) return id;
    seen.add(id);
    const kids = visibleChildren(messages, id);
    if (kids.length === 0) return id;
    id = kids[kids.length - 1].id;
  }
}
