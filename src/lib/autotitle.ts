import { DEFAULT_TITLE_PROMPT, getAppConfig } from '@/db/db';
import {
  getConnection,
  getMessages,
  getSession,
  updateSession,
} from '@/db/repo';
import { partsText } from './conversation';
import { activePath } from './tree';
import { readSSE } from './sse';
import { providerForConnection } from '@/providers/registry';
import type { ChatMessage } from '@/providers/types';

/**
 * After the first exchange, ask the configured title model for a short title.
 * No-ops when no title model is set (the placeholder title from the first user
 * message then stands) or once the chat has more than one user turn.
 */
export async function maybeAutoTitle(sessionId: string): Promise<void> {
  const config = await getAppConfig();
  if (!config.titleConnectionId || !config.titleModel) return;

  const session = await getSession(sessionId);
  if (!session) return;

  const path = activePath(await getMessages(sessionId), session.currentLeafId);
  const convo = path.filter((m) => m.role === 'user' || m.role === 'assistant');
  const users = convo.filter((m) => m.role === 'user');
  // Only title the very first exchange (one user turn, at least one reply).
  if (users.length !== 1 || convo.length < 2) return;

  const connection = await getConnection(config.titleConnectionId);
  if (!connection) return;

  const transcript = convo
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${partsText(m.content)}`)
    .join('\n\n')
    .slice(0, 6000);

  const messages: ChatMessage[] = [
    {
      role: 'user',
      text: `${config.titlePrompt || DEFAULT_TITLE_PROMPT}\n\n---\n${transcript}`,
    },
  ];

  try {
    const provider = providerForConnection(connection);
    const req = provider.buildRequest({
      model: config.titleModel,
      messages,
      settings: { maxTokens: 32, temperature: 0.3 },
      apiKey: connection.apiKey,
      url: connection.url,
      project: connection.project,
      region: connection.region,
      clientEmail: connection.clientEmail,
      privateKey: connection.privateKey,
    });
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!res.ok || !res.body) return;

    let text = '';
    for await (const data of readSSE(res.body)) {
      for (const delta of provider.parseStreamChunk(data)) {
        if (delta.kind === 'text') text += delta.text;
      }
    }

    const title = cleanTitle(text);
    if (title) await updateSession(sessionId, { title });
  } catch {
    // Title generation is best-effort; keep the placeholder on failure.
  }
}

function cleanTitle(raw: string): string {
  const first = raw.trim().split('\n')[0] ?? '';
  const stripped = first.replace(/^["'#\s]+|["'\s]+$/g, '').replace(/[.。]+$/, '');
  return stripped.length > 60 ? stripped.slice(0, 60).trimEnd() : stripped;
}
