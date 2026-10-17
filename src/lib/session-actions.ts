import {
  createSession,
  ensureDefaultPreset,
  getFolder,
  emptySessionIds,
  getSession,
  listSessions,
  purgeSession,
  trashSessions as trashSessionRows,
} from '@/db/repo';
import type { Session } from '@/db/types';
import { useUiStore } from '@/store/ui';

/**
 * Create a chat and make it active. Chats always live in a preset: an explicit
 * one when given, else the active preset, else the active chat's preset, else
 * the default preset.
 */
export async function startNewSession(
  folderId: string | null = null,
): Promise<Session> {
  const ui = useUiStore.getState();
  let target = folderId ?? ui.activePresetId;
  if (!target && ui.activeSessionId) {
    target = (await getSession(ui.activeSessionId))?.folderId ?? null;
  }
  // A deleted preset's id would make an orphan no sidebar row can reach.
  if (target && !(await getFolder(target))) target = null;
  if (!target) target = await ensureDefaultPreset();

  const session = await createSession({ folderId: target });
  ui.setActivePreset(target);
  ui.setActiveSession(session.id);
  return session;
}

/**
 * Delete chats. One with content goes to the trash (restorable); an empty one
 * (no live turn or aside: never sent, or emptied) is removed outright, since
 * the trash would only hold a blank. The open chat, if among them, steps to
 * its neighbor first, so the pane never shows a chat mid-removal.
 */
export async function trashSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const removed = new Set(ids);
  const ui = useUiStore.getState();
  const open = ui.activeSessionId;
  if (open && removed.has(open)) {
    stepOff(open, await listSessions(true), removed);
  }
  const empty = await emptySessionIds(ids);
  await trashSessionRows(ids.filter((id) => !empty.has(id)));
  for (const id of empty) await purgeSession(id);
}

/**
 * Step off a chat that is gone (trashed or missing). ChatPane calls this
 * whenever the open chat turns out to be gone, so no path — a menu
 * click-through, a sync, a restore — can leave one on screen.
 */
export async function leaveChat(id: string): Promise<void> {
  const all = await listSessions(true);
  if (useUiStore.getState().activeSessionId !== id) return;
  stepOff(id, all, new Set());
}

/** Open the next live chat in `id`'s preset, then the previous, else that
 *  preset's blank view. `removed` are chats about to go (still live in `all`). */
function stepOff(id: string, all: Session[], removed: Set<string>): void {
  const ui = useUiStore.getState();
  const presetId = all.find((s) => s.id === id)?.folderId ?? ui.activePresetId;
  const siblings = all.filter((s) => s.folderId === presetId);
  const i = siblings.findIndex((s) => s.id === id);
  const live = (s: Session) => !s.deletedAt && !removed.has(s.id);
  const next =
    siblings.slice(i + 1).find(live) ??
    siblings.slice(0, Math.max(i, 0)).reverse().find(live);
  if (presetId) ui.setActivePreset(presetId);
  ui.setActiveSession(next?.id ?? null);
}
