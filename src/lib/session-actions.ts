import { createSession, ensureDefaultPreset, getSession } from '@/db/repo';
import type { Session } from '@/db/types';
import { useUiStore } from '@/store/ui';

/**
 * Create a chat and make it active. Chats always live in a preset: an explicit
 * one when given, else the active chat's preset, else the default preset.
 */
export async function startNewSession(
  folderId: string | null = null,
): Promise<Session> {
  let target = folderId;
  if (!target) {
    const activeId = useUiStore.getState().activeSessionId;
    if (activeId) target = (await getSession(activeId))?.folderId ?? null;
  }
  if (!target) target = await ensureDefaultPreset();

  const session = await createSession({ folderId: target });
  useUiStore.getState().setActiveSession(session.id);
  return session;
}
