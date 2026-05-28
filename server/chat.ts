import { Hono } from 'hono';
import { getAccessToken, loadServiceAccount } from './vertex-auth.ts';

/**
 * Chat passthrough routes. The client builds the provider payload; the proxy
 * attaches auth and streams the upstream SSE straight back.
 *
 *  - OpenAI-compatible (OpenRouter / OpenAI / Gemini's OpenAI endpoint / any
 *    base URL): key from the `x-api-key` header, or `OPENROUTER_KEY` /
 *    `OPENAI_KEY` env as fallback.
 *  - Vertex AI: server-minted OAuth token from a service-account JSON
 *    (`GOOGLE_VERTEX_CREDENTIALS`), never exposed to the browser.
 *
 * Endpoints validate the upstream origin so the proxy can't be turned into an
 * open forwarder.
 */
export const chat = new Hono();

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
} as const;

export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Normalize and validate an OpenAI-compatible base URL. */
export function safeBaseUrl(raw: unknown): string | null {
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

chat.post('/vertex', async (c) => {
  const { project, region, model, payload, clientEmail, privateKey } = await c.req
    .json<{
      project?: string;
      region?: string;
      model?: string;
      payload?: unknown;
      clientEmail?: string;
      privateKey?: string;
    }>()
    .catch(() => ({}) as Record<string, undefined>);

  if (!project || !region || !model || !payload) {
    return errorResponse('Missing project, region, model, or payload.', 400);
  }

  // Prefer the connection's service-account creds; fall back to a server JSON.
  const sa =
    clientEmail && privateKey
      ? { client_email: clientEmail, private_key: privateKey }
      : loadServiceAccount();
  if (!sa) {
    return errorResponse(
      'Vertex is not configured: add the service-account client_email + private_key to the connection (or set GOOGLE_VERTEX_CREDENTIALS on the server).',
      501,
    );
  }

  let token: string;
  try {
    token = await getAccessToken(sa);
  } catch (err) {
    return errorResponse(`Vertex auth failed: ${String(err)}`, 502);
  }

  const endpoint =
    `https://${region}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${region}/publishers/google/models/` +
    `${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
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
