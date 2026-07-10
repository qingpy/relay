import type { Connection } from '@/db/types';
import { providerForConnection } from '@/providers/registry';
import { collectStreamText } from './sse';

export interface TestResult {
  ok: boolean;
  text?: string;
  ms?: number;
  error?: string;
}

/** Send a tiny message through a connection's model to confirm it works.
 *  `secret` carries a just-typed, not-yet-saved key so a connection can be
 *  tested before its key reaches the store; otherwise the proxy uses the stored
 *  key resolved by connection id. */
export async function testConnection(
  conn: Connection,
  model: string,
  secret?: { apiKey?: string; privateKey?: string },
): Promise<TestResult> {
  const provider = providerForConnection(conn);
  const req = provider.buildRequest({
    model,
    messages: [{ role: 'user', text: 'Reply with exactly: ok' }],
    settings: { maxTokens: 16, temperature: 0 },
    connectionId: conn.id,
    url: conn.url,
    project: conn.project,
    region: conn.region,
    clientEmail: conn.clientEmail,
    apiKey: secret?.apiKey || undefined,
    privateKey: secret?.privateKey || undefined,
  });

  const start = Date.now();
  try {
    const { text, error } = await collectStreamText(provider, req);
    if (error) return { ok: false, error };
    return { ok: true, text: text.trim().slice(0, 80), ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
