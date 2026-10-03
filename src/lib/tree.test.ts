/**
 * Tree invariants for send / clear / aside-fork. Run: npx tsx src/lib/tree.test.ts
 */
import type { Message, MessageRole } from '../db/types';
import {
  activePath,
  activeWindow,
  attachParentId,
  copyablePath,
  canDeleteDivider,
  detachClearDividers,
  displayPath,
  hasOtherBranches,
  retargetClearedFrom,
  isEmptyUserSlot,
  roleSiblings,
  segmentTree,
  switchSibling,
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

// Live leaf and forest-root divider: attach as child of the divider.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { clearedFromId: 'a' });
  const other = msg('other', 'user', { parentId: 'a' });
  eq('live leaf', attachParentId([u, a], 'a'), 'a');
  eq('divider leaf', attachParentId([u, a, d], 'd'), 'd');
  eq('missing leaf', attachParentId([u, a], 'gone'), null);
  eq('no leaf', attachParentId([u, a], null), null);
  const u2 = msg('u2', 'user', { parentId: attachParentId([u, a, d, other], 'd') });
  const all = [u, a, d, other, u2];
  eq(
    'clear then send is the new trunk',
    activePath(all, 'u2').map((m) => m.id),
    ['d', 'u2'],
  );
  eq(
    'view stitches history above the divider',
    displayPath(all, 'u2').map((m) => m.id),
    ['u', 'a', 'd', 'u2'],
  );
  eq(
    'other fork still a child of the same assistant',
    all.filter((m) => m.parentId === 'a').map((m) => m.id),
    ['other'],
  );
}

// Deleted assistant: stay on that variant (‹ n/m › remains on the path).
{
  const u = msg('u', 'user');
  const a1 = msg('a1', 'assistant', { parentId: 'u' });
  const a2 = msg('a2', 'assistant', { parentId: 'u', deletedAt: 1 });
  eq('deleted assistant attach to self', attachParentId([u, a1, a2], 'a2'), 'a2');
}

// Continuation-era divider becomes a forest root and remembers the cut leaf.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { parentId: 'a' });
  const u2 = msg('u2', 'user', { parentId: 'd' });
  const next = detachClearDividers([u, a, d, u2]);
  eq('continuation divider detached to root', next[2].parentId, null);
  eq('detach remembers the leaf it cut', next[2].clearedFromId, 'a');
  eq(
    'view still stitches history',
    displayPath(next, 'u2').map((m) => m.id),
    ['u', 'a', 'd', 'u2'],
  );
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

// Fork copies the model window (after Clear), not pre-divider history.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { clearedFromId: 'a' });
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
  eq(
    'real path after clear is the new trunk',
    activePath(all, 'a2').map((m) => m.id),
    ['d', 'u2', 'a2'],
  );
  eq(
    'view after clear keeps history',
    displayPath(all, 'a2').map((m) => m.id),
    ['u', 'a', 'd', 'u2', 'a2'],
  );
  eq(
    'map after clear is two first-level trees',
    segmentTree(all).map((s) => s.messages.map((m) => m.id)),
    [
      ['u', 'a'],
      ['u2', 'a2'],
    ],
  );
}

// Branch a pre-clear turn: that trunk's history, no divider. ‹ n/m › in the
// stitched history restitches and keeps the divider.
{
  const u = msg('u', 'user');
  const a1 = msg('a1', 'assistant', { parentId: 'u' });
  const a2 = msg('a2', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { clearedFromId: 'a1' });
  const u2 = msg('u2', 'user', { parentId: 'd' });
  const u3 = msg('u3', 'user', { parentId: 'a2' });
  const all = [u, a1, a2, d, u2, u3];
  eq(
    'branch before clear shows the old path',
    activePath(all, 'u3').map((m) => m.id),
    ['u', 'a2', 'u3'],
  );
  eq(
    'branch before clear has no divider in the view',
    displayPath(all, 'u3').map((m) => m.id),
    ['u', 'a2', 'u3'],
  );
  eq(
    'branch before clear keeps history for the model',
    activeWindow(activePath(all, 'u3')).map((m) => m.id),
    ['u', 'a2', 'u3'],
  );
  eq(
    'post-clear send has no pre-clear history',
    activeWindow(activePath(all, 'u2')).map((m) => m.id),
    ['u2'],
  );
  eq(
    'map: old trunk and new trunk are first-level trees',
    segmentTree(all).map((s) => s.messages.map((m) => m.id)),
    [['u'], ['u2']],
  );
  const restitch = switchSibling(all, 'u2', a1, a2);
  eq(
    '‹ n/m › in stitched history restitches',
    restitch,
    { stitchFrom: { dividerId: 'd', clearedFromId: 'u3' } },
  );
  const restitched = all.map((m) =>
    m.id === 'd' ? { ...m, clearedFromId: 'u3' } : m,
  );
  eq(
    'restitched view keeps the divider',
    displayPath(restitched, 'u2').map((m) => m.id),
    ['u', 'a2', 'u3', 'd', 'u2'],
  );
  const onNew = switchSibling(all, 'u2', u2, u2);
  eq('‹ n/m › on the new trunk is a leaf walk', 'leafId' in onNew, true);
}

// Two Clears: view stacks both previous chats.
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d1 = msg('d1', 'divider', { clearedFromId: 'a' });
  const u2 = msg('u2', 'user', { parentId: 'd1' });
  const a2 = msg('a2', 'assistant', { parentId: 'u2' });
  const d2 = msg('d2', 'divider', { clearedFromId: 'a2' });
  const u3 = msg('u3', 'user', { parentId: 'd2' });
  const all = [u, a, d1, u2, a2, d2, u3];
  eq(
    'two clears keep both previous chats',
    displayPath(all, 'u3').map((m) => m.id),
    ['u', 'a', 'd1', 'u2', 'a2', 'd2', 'u3'],
  );
  eq(
    'model after the second clear is only the newest trunk',
    activeWindow(activePath(all, 'u3')).map((m) => m.id),
    ['u3'],
  );
  eq(
    'map has a first-level tree per Clear',
    segmentTree(all).map((s) => s.messages.map((m) => m.id)),
    [['u', 'a'], ['u2', 'a2'], ['u3']],
  );
  const a1b = msg('a1b', 'assistant', { parentId: 'u' });
  const withFork = [...all, a1b];
  eq(
    '‹ n/m › in the oldest segment restitches the first divider',
    switchSibling(withFork, 'u3', a, a1b),
    { stitchFrom: { dividerId: 'd1', clearedFromId: 'a1b' } },
  );
  const u2b = msg('u2b', 'user', { parentId: 'd1' });
  const withMid = [...all, u2b];
  eq(
    '‹ n/m › between Clears restitches the following divider',
    switchSibling(withMid, 'u3', u2, u2b),
    { stitchFrom: { dividerId: 'd2', clearedFromId: 'u2b' } },
  );
}

{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d2 = msg('d2', 'divider', { clearedFromId: 'd1' });
  const u3 = msg('u3', 'user', { parentId: 'd2' });
  const afterRestore = retargetClearedFrom([u, a, d2, u3], 'd1', 'a');
  eq(
    'Restore of an empty stacked divider keeps the cut leaf',
    afterRestore.find((m) => m.id === 'd2')?.clearedFromId,
    'a',
  );
}

// Middle trunk spliced: dangling clearedFromId must not recurse (blank page).
{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d1 = msg('d1', 'divider', { clearedFromId: 'a' });
  const d2 = msg('d2', 'divider', { clearedFromId: 'gone' });
  const u3 = msg('u3', 'user', { parentId: 'd2' });
  const all = [u, a, d1, d2, u3];
  eq(
    'dangling clearedFromId falls back to the previous Clear',
    displayPath(all, 'u3').map((m) => m.id),
    ['u', 'a', 'd1', 'd2', 'u3'],
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

{
  const u = msg('u', 'user');
  const a = msg('a', 'assistant', { parentId: 'u' });
  const d = msg('d', 'divider', { clearedFromId: 'a' });
  const all = [u, a, d];
  eq('empty divider is deletable', canDeleteDivider(all, d), true);
  eq('empty divider is not ‹ n/m ›', hasOtherBranches(all, d), false);
  eq(
    'empty clear still shows history',
    displayPath(all, 'd').map((m) => m.id),
    ['u', 'a', 'd'],
  );
  eq(
    'empty Clear is omitted from the map',
    segmentTree(all).map((s) => s.messages.map((m) => m.id)),
    [['u', 'a']],
  );
  const aside = msg('as', 'user', { parentId: 'd', aside: true });
  eq(
    'aside on a divider blocks Restore',
    canDeleteDivider([u, a, d, aside], d),
    false,
  );
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ok');
