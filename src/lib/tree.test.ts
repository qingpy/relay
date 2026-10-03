/**
 * Tree invariants for send / clear / aside-fork. Run: npx tsx src/lib/tree.test.ts
 */
import type { Message, MessageRole } from '../db/types';
import {
  activePath,
  attachParentId,
  copyablePath,
  displayPath,
  isEmptyUserSlot,
  reparentRootDividers,
  reparentRootDividersAll,
  roleSiblings,
} from './tree';

let t = 0;
function msg(
  id: string,
  role: MessageRole,
  extra: Partial<Message> = {},
): Message {
  return {
    id,
    sessionId: 's',
    parentId: extra.parentId ?? null,
    role,
    content: extra.content ?? [],
    createdAt: extra.createdAt ?? ++t,
    ...extra,
  };
}

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  }
}

// 3a: two user roots, empty deleted slot. Fill in place (same parent = null).
{
  const live = msg('live', 'user');
  const empty = msg('empty', 'user', { deletedAt: 1 });
  const all = [live, empty];
  eq('empty root is a slot', isEmptyUserSlot(all, empty), true);
  eq('empty root attach is sibling (null)', attachParentId(all, 'empty'), null);
  eq('live root ‹ n/m ›', roleSiblings(all, live).map((m) => m.id), [
    'live',
    'empty',
  ]);
}

// 3a: empty user under a deleted shared ancestor — do not walk to a new root.
{
  const ancestor = msg('anc', 'assistant', { deletedAt: 1 });
  const live = msg('live', 'user', { parentId: 'anc' });
  const empty = msg('empty', 'user', { parentId: 'anc', deletedAt: 1 });
  const all = [ancestor, live, empty];
  eq('slot under deleted ancestor', isEmptyUserSlot(all, empty), true);
  eq(
    'attach stays under deleted ancestor',
    attachParentId(all, 'empty'),
    'anc',
  );
  const filled = msg('filled', 'user', { parentId: attachParentId(all, 'empty') });
  const withFilled = [...all, filled];
  eq(
    'filled is ‹ n/m › with live fork',
    roleSiblings(withFilled, filled)
      .filter((m) => !m.deletedAt)
      .map((m) => m.id)
      .sort(),
    ['filled', 'live'],
  );
  const orphan = msg('orphan', 'user', { parentId: null });
  eq(
    'a new forest root is not a sibling of the live fork',
    roleSiblings([...all, orphan], orphan).some((m) => m.id === 'live'),
    false,
  );
}

// Live leaf and divider: attach as child.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { parentId: 'a' });
  const other = msg('other', 'user', { parentId: 'a' });
  eq('live leaf', attachParentId([u, a], 'a'), 'a');
  eq('divider leaf', attachParentId([u, a, d], 'd'), 'd');
  eq('missing leaf', attachParentId([u, a], 'gone'), null);
  eq('no leaf', attachParentId([u, a], null), null);
  const u2 = msg('u2', 'user', { parentId: attachParentId([u, a, d, other], 'd') });
  eq(
    'clear then send stays on this path',
    activePath([u, a, d, other, u2], 'u2').map((m) => m.id),
    ['u', 'a', 'd', 'u2'],
  );
  eq(
    'other fork still a child of the same assistant',
    [u, a, d, other, u2].filter((m) => m.parentId === 'a').map((m) => m.id),
    ['d', 'other'],
  );
}

// Deleted assistant: stay on that variant (‹ n/m › remains on the path).
{
  const u = msg('u', 'user');
  const a1 = msg('a1', 'assistant', { parentId: 'u' });
  const a2 = msg('a2', 'assistant', { parentId: 'u', deletedAt: 1 });
  eq('deleted assistant attach to self', attachParentId([u, a1, a2], 'a2'), 'a2');
}

// Continuation divider is already on the path — leave it.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { parentId: 'a' });
  const next = reparentRootDividers([u, a, d]);
  eq('continuation divider unchanged', next[2].parentId, 'a');
}

// Leftover forest-root divider → sit on the path it cut.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', {
    parentId: null,
    clearedFromId: 'a',
    createdAt: 99,
  });
  const next = reparentRootDividers([u, a, d]);
  eq('root divider reparented to clearedFromId', next[2].parentId, 'a');
  const path = activePath(next, 'd').map((m) => m.id);
  eq('chat path is history + divider', path, ['u', 'a', 'd']);
  eq(
    'fork from that divider is the empty window',
    copyablePath(next, 'd').map((m) => m.id),
    [],
  );
}

{
  const a = msg('a', 'user', { sessionId: 's1' });
  const d = msg('d', 'divider', {
    sessionId: 's2',
    parentId: null,
    createdAt: 50,
  });
  const next = reparentRootDividersAll([a, d]);
  eq('reparent does not cross sessions', next[1].parentId, null);
}

{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u', createdAt: 2 });
  const d = msg('d', 'divider', { parentId: null, createdAt: 3 });
  const next = reparentRootDividers([u, a, d]);
  eq('root divider without clearedFromId', next[2].parentId, 'a');
}

{
  const u = msg('u', 'user');
  const aside = msg('as', 'user', { parentId: 'u', aside: true, deletedAt: 1 });
  const reply = msg('ar', 'assistant', { parentId: 'as', aside: true });
  eq(
    'aside is not a fillable main slot',
    isEmptyUserSlot([u, aside, reply], aside),
    false,
  );
}

{
  const u = msg('u', 'user', { createdAt: 1 });
  const aside = msg('as', 'user', { parentId: 'u', aside: true, createdAt: 2 });
  const d = msg('d', 'divider', { parentId: null, createdAt: 3 });
  const next = reparentRootDividers([u, aside, d]);
  eq('root divider sits on the main leaf, not the aside', next[2].parentId, 'u');
}

// Fork copies the model window (after Clear), not pre-divider history.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { parentId: 'a' });
  const u2 = msg('u2', 'user', { parentId: 'd' });
  const a2 = msg('a2', 'assistant', { parentId: 'u2' });
  const all = [u, a, d, u2, a2];
  eq(
    'fork after clear is post-divider turns',
    copyablePath(all, 'a2').map((m) => m.id),
    ['u2', 'a2'],
  );
  eq(
    'fork from the divider itself is empty',
    copyablePath(all, 'd').map((m) => m.id),
    [],
  );
  const rootD = msg('rd', 'divider', { parentId: null });
  eq(
    'fork of a lone root divider is empty',
    copyablePath([rootD], 'rd').map((m) => m.id),
    [],
  );
}

{
  const rootAside = msg('ra', 'user', { aside: true });
  const rootAns = msg('rr', 'assistant', { parentId: 'ra', aside: true });
  eq(
    'root asides show on an empty chat',
    displayPath([rootAside, rootAns]).map((m) => m.id),
    ['ra', 'rr'],
  );
  const u = msg('u', 'user');
  eq(
    'root asides stay at the head of a later main path',
    displayPath([rootAside, rootAns, u], 'u').map((m) => m.id),
    ['ra', 'rr', 'u'],
  );
}

// Fork uses the node the aside hangs from, not a later main leaf.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const later = msg('u2', 'user', { parentId: 'a' });
  const all = [u, a, later];
  eq(
    'hung-from the original leaf omits later turns',
    copyablePath(all, 'a').map((m) => m.id),
    ['u', 'a'],
  );
  eq(
    'current leaf after a later send includes it',
    copyablePath(all, 'u2').map((m) => m.id),
    ['u', 'a', 'u2'],
  );
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ok');
