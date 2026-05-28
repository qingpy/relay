import { createSession, ensureDefaultPreset, getSession } from '@/db/repo';
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
