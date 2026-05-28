import { getAppConfig } from '@/db/db';
import { createSession } from '@/db/repo';
import type { Session } from '@/db/types';
import { useUiStore } from '@/store/ui';

/** Create a session from the configured defaults and make it active. */
export async function startNewSession(): Promise<Session> {
  const config = await getAppConfig();
  const session = await createSession({
    provider: config.defaultProvider,
    model: config.defaultModel,
  });
  useUiStore.getState().setActiveSession(session.id);
  return session;
}
