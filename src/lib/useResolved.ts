import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { getSession, listConnections } from '@/db/repo';
import { resolveConfig, type ResolvedConfig } from './resolve';

/**
 * Live effective config (connection, model, settings, capabilities) for the
 * current chat target: a chat when `sessionId` is given, otherwise the `folderId`
 * preset alone (the blank "new chat" bound to a preset), else undefined.
 */
export function useResolvedConfig(
  sessionId: string | null,
  folderId: string | null = null,
): ResolvedConfig | undefined {
  return useLiveQuery(async () => {
    if (sessionId) {
      const session = await getSession(sessionId);
      const folder = session?.folderId
        ? await db.folders.get(session.folderId)
        : undefined;
      const connections = await listConnections();
      return resolveConfig(session, folder, connections);
    }
    if (folderId) {
      const folder = await db.folders.get(folderId);
      if (!folder) return undefined;
      const connections = await listConnections();
      return resolveConfig(undefined, folder, connections);
    }
    return undefined;
  }, [sessionId, folderId]);
}
