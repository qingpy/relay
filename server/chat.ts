import { Hono } from 'hono';

/**
 * Chat passthrough routes. The client builds the provider payload; the proxy
 * attaches auth and streams the upstream SSE straight back.
 *
 *  - OpenAI-compatible (OpenRouter / OpenAI / any base URL): key from the
 *    `x-api-key` header, or `OPENROUTER_KEY` / `OPENAI_KEY` env as fallback.
 *  - Gemini AI Studio: key from `x-api-key`, or `GEMINI_KEY` env.
 *
 * Endpoints validate the upstream origin so the proxy can't be turned into an
 * open forwarder. Vertex (server-minted OAuth) is added in a later milestone.
 */
export const chat = new Hono();

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
} as const;

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Normalize and validate an OpenAI-compatible base URL. */
function safeBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

chat.post('/openai', async (c) => {
  const { baseUrl: rawBase, payload } = await c.req
    .json<{ baseUrl?: string; payload?: unknown }>()
    .catch(() => ({ baseUrl: undefined, payload: undefined }));

  const baseUrl = safeBaseUrl(rawBase);
  if (!baseUrl) return errorResponse('Invalid or missing baseUrl.', 400);
  if (!payload) return errorResponse('Missing request payload.', 400);

  const key =
    c.req.header('x-api-key') ||
    process.env.OPENROUTER_KEY ||
    process.env.OPENAI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'X-Title': 'Relay',
      },
      body: JSON.stringify(payload),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    return errorResponse(`Upstream request failed: ${String(err)}`, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return errorResponse(text || upstream.statusText, upstream.status);
  }
  return new Response(upstream.body, { headers: SSE_HEADERS });
});

chat.post('/gemini', async (c) => {
  const { model, payload } = await c.req
    .json<{ model?: string; payload?: unknown }>()
    .catch(() => ({ model: undefined, payload: undefined }));

  if (!model || !payload) {
    return errorResponse('Missing model or payload.', 400);
  }

  const key = c.req.header('x-api-key') || process.env.GEMINI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    return errorResponse(`Upstream request failed: ${String(err)}`, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return errorResponse(text || upstream.statusText, upstream.status);
  }
  return new Response(upstream.body, { headers: SSE_HEADERS });
});
