import type { Connection } from '@/db/types';
import { modelsUrlFrom } from '@/lib/models';

const ENDPOINT: Record<Connection['type'], string> = {
  openai: '/api/models/openai',
  vertex: '/api/models/vertex',
};

/** Ask the proxy for a connection's available model ids. `apiKey` carries a
 *  just-typed, not-yet-saved key; otherwise the proxy uses the stored key. */
export async function detectModels(
  conn: Connection,
  apiKey?: string,
): Promise<string[]> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const modelsUrl = conn.url ? modelsUrlFrom(conn.url) : null;
  if (conn.type === 'openai' && !modelsUrl) {
    throw new Error(
      'Auto-detect needs a standard “…/chat/completions” URL — add models by hand.',
    );
  }

  const res = await fetch(ENDPOINT[conn.type], {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: modelsUrl, connectionId: conn.id }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Model list failed (${res.status})`);
  }
  const j = (await res.json()) as { models?: string[] };
  return j.models ?? [];
}
