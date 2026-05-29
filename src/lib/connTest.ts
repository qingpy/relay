import type { Connection } from '@/db/types';
import { providerForConnection } from '@/providers/registry';
import { readSSE } from './sse';

export interface TestResult {
  ok: boolean;
  text?: string;
  ms?: number;
  error?: string;
}

/** Send a tiny message through a connection's model to confirm it works. */
export async function testConnection(
  conn: Connection,
  model: string,
): Promise<TestResult> {
  const provider = providerForConnection(conn);
  const req = provider.buildRequest({
    model,
    messages: [{ role: 'user', text: 'Reply with exactly: ok' }],
    settings: { maxTokens: 16, temperature: 0 },
    apiKey: conn.apiKey,
    url: conn.url,
    project: conn.project,
    region: conn.region,
    clientEmail: conn.clientEmail,
    privateKey: conn.privateKey,
  });

  const start = Date.now();
  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: j?.error || `HTTP ${res.status}` };
    }
    let text = '';
    for await (const data of readSSE(res.body)) {
      for (const d of provider.parseStreamChunk(data)) {
        if (d.kind === 'text') text += d.text;
        else if (d.kind === 'error') return { ok: false, error: d.message };
      }
    }
    return { ok: true, text: text.trim().slice(0, 80), ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
