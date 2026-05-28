import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { getSession, listConnections } from '@/db/repo';
import { resolveConfig, type ResolvedConfig } from './resolve';

/** Live effective config (connection, model, settings, capabilities) for a chat. */
export function useResolvedConfig(
  sessionId: string | null,
): ResolvedConfig | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return undefined;
    const session = await getSession(sessionId);
    const folder = session?.folderId
      ? await db.folders.get(session.folderId)
      : undefined;
    const connections = await listConnections();
    return resolveConfig(session, folder, connections);
  }, [sessionId]);
}
