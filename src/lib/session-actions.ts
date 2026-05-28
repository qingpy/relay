import { ensureDefaultConnection } from '@/db/db';
import { createSession } from '@/db/repo';
import type { Session } from '@/db/types';
import { useUiStore } from '@/store/ui';

/** Create a chat (optionally inside a preset) and make it active. */
export async function startNewSession(
  folderId: string | null = null,
): Promise<Session> {
  // Guarantee a connection exists so the new chat has a model to resolve to.
  await ensureDefaultConnection();
  const session = await createSession({ folderId });
  useUiStore.getState().setActiveSession(session.id);
  return session;
}
