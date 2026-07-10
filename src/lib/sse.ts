import type { Provider, ProxyRequest } from '@/providers/types';

/**
 * Read a `text/event-stream` body and yield each event's `data` payload as a
 * string. Handles multi-line `data:` fields, ignores comments, and stops on the
 * OpenAI `[DONE]` sentinel. Providers parse the payloads into deltas.
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. Normalize CRLF first.
      let sep: number;
      buffer = buffer.replace(/\r\n/g, '\n');
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const data = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');

        if (!data) continue;
        if (data === '[DONE]') return;
        yield data;
      }
    }

    // Flush any trailing event without a final blank line.
    const tail = buffer.trim();
    if (tail) {
      const data = tail
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data && data !== '[DONE]') yield data;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** POST a built provider request and collect the streamed text deltas into one
 *  string — the simple consumer shared by auto-title and connection tests (the
 *  chat engine has its own full delta loop). An error delta stops collection. */
export async function collectStreamText(
  provider: Provider,
  req: ProxyRequest,
): Promise<{ text: string; error?: string }> {
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return { text: '', error: j?.error || `HTTP ${res.status}` };
  }
  let text = '';
  for await (const data of readSSE(res.body)) {
    for (const d of provider.parseStreamChunk(data)) {
      if (d.kind === 'text') text += d.text;
      else if (d.kind === 'error') return { text, error: d.message };
    }
  }
  return { text };
}
