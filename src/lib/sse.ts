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
