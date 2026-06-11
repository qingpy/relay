import {
  createSession,
  ensureDefaultPreset,
  getSession,
  listSessions,
  trashSession,
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
  if (!target) target = await ensureDefaultPreset();

  const session = await createSession({ folderId: target });
  ui.setActivePreset(target);
  ui.setActiveSession(session.id);
  return session;
}

/**
 * Move one or more chats to the trash. If the chat currently on screen is among
 * them, advance to the next surviving chat in its preset (then the previous),
 * falling back to that preset's blank view when none remain — never leaving the
 * trashed chat showing.
 */
export async function trashSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ui = useUiStore.getState();
  const activeId = ui.activeSessionId;
  const removed = new Set(ids);
  const advancing = !!activeId && removed.has(activeId);

  let nextId: string | null = activeId;
  let presetId: string | null = null;
  if (advancing) {
    // Compute the replacement before trashing, while siblings are still listed.
    const all = await listSessions();
    presetId = all.find((s) => s.id === activeId)?.folderId ?? null;
    const siblings = all.filter((s) => s.folderId === presetId);
    const i = siblings.findIndex((s) => s.id === activeId);
    nextId = null;
    for (let j = i + 1; j < siblings.length && nextId === null; j++) {
      if (!removed.has(siblings[j].id)) nextId = siblings[j].id;
    }
    for (let j = i - 1; j >= 0 && nextId === null; j--) {
      if (!removed.has(siblings[j].id)) nextId = siblings[j].id;
    }
  }

  for (const id of ids) await trashSession(id);

  if (advancing) {
    if (presetId) ui.setActivePreset(presetId);
    ui.setActiveSession(nextId);
  }
}
