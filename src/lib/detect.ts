import type { Connection } from '@/db/types';

const ENDPOINT: Record<Connection['type'], string> = {
  openai: '/api/models/openai',
  vertex: '/api/models/vertex',
};

/** Ask the proxy for a connection's available model ids. */
export async function detectModels(conn: Connection): Promise<string[]> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (conn.apiKey) headers['x-api-key'] = conn.apiKey;

  const res = await fetch(ENDPOINT[conn.type], {
    method: 'POST',
    headers,
    body: JSON.stringify({ baseUrl: conn.baseUrl }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Model list failed (${res.status})`);
  }
  const j = (await res.json()) as { models?: string[] };
  return j.models ?? [];
}
