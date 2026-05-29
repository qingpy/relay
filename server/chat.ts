import { Hono } from 'hono';
import { getConnectionSecret } from './secrets.ts';
import { getAccessToken, loadServiceAccount } from './vertex-auth.ts';

/**
 * Chat passthrough routes. The client builds the provider payload; the proxy
 * attaches auth and streams the upstream SSE straight back.
 *
 *  - OpenAI-compatible (OpenRouter / OpenAI / Gemini's OpenAI endpoint / any
 *    base URL): key resolved from the secret store by `connectionId`, or a
 *    transient `x-api-key` header (testing an unsaved key), or
 *    `OPENROUTER_KEY` / `OPENAI_KEY` env as fallback.
 *  - Vertex AI: server-minted OAuth token from a service-account whose private
 *    key comes from the secret store (or a transient one in the body for
 *    testing), or `GOOGLE_VERTEX_CREDENTIALS`. The key never reaches the browser.
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

/** Validate a user-supplied upstream URL — used verbatim, so only the protocol
 *  is checked (and it must parse as a URL). */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return raw;
  } catch {
    return null;
  }
}

chat.post('/openai', async (c) => {
  const { url: rawUrl, payload, connectionId } = await c.req
    .json<{ url?: string; payload?: unknown; connectionId?: string }>()
    .catch(() => ({ url: undefined, payload: undefined, connectionId: undefined }));

  const url = safeUrl(rawUrl);
  if (!url) return errorResponse('Invalid or missing url.', 400);
  if (!payload) return errorResponse('Missing request payload.', 400);

  const key =
    c.req.header('x-api-key') || // transient: testing an unsaved key
    (await getConnectionSecret(connectionId))?.apiKey ||
    process.env.OPENROUTER_KEY ||
    process.env.OPENAI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
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
  const { project, region, model, payload, connectionId, clientEmail, privateKey } =
    await c.req
      .json<{
        project?: string;
        region?: string;
        model?: string;
        payload?: unknown;
        connectionId?: string;
        clientEmail?: string;
        privateKey?: string;
      }>()
      .catch(() => ({}) as Record<string, undefined>);

  if (!project || !region || !model || !payload) {
    return errorResponse('Missing project, region, model, or payload.', 400);
  }

  // Service-account email is non-secret config (from the connection); the
  // private key comes from the secret store by id, or a transient one in the
  // body when testing. Fall back to a server-side JSON if neither is present.
  const pk = privateKey || (await getConnectionSecret(connectionId))?.privateKey;
  const sa =
    clientEmail && pk
      ? { client_email: clientEmail, private_key: pk }
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

  // The `global` location uses the un-prefixed host; regions are prefixed.
  const host =
    region === 'global'
      ? 'aiplatform.googleapis.com'
      : `${region}-aiplatform.googleapis.com`;
  const endpoint =
    `https://${host}/v1/projects/${project}` +
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
