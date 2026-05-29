import { Hono } from 'hono';
import { errorResponse, safeUrl } from './chat.ts';
import { getConnectionSecret } from './secrets.ts';

/**
 * Model-discovery routes. The proxy lists upstream models so the client can
 * populate a connection's catalog. (Vertex listing isn't offered — add Vertex
 * models manually.)
 */
export const models = new Hono();

models.post('/openai', async (c) => {
  const { url: rawUrl, connectionId } = await c.req
    .json<{ url?: string; connectionId?: string }>()
    .catch(() => ({ url: undefined, connectionId: undefined }));
  const url = safeUrl(rawUrl);
  if (!url) return errorResponse('Invalid or missing url.', 400);

  const key =
    c.req.header('x-api-key') || // transient: detecting against an unsaved key
    (await getConnectionSecret(connectionId))?.apiKey ||
    process.env.OPENROUTER_KEY ||
    process.env.OPENAI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${key}` },
    });
  } catch (err) {
    return errorResponse(`Model list failed: ${String(err)}`, 502);
  }
  if (!res.ok) {
    return errorResponse(await res.text().catch(() => res.statusText), res.status);
  }
  const json = (await res.json().catch(() => null)) as {
    data?: { id?: string }[];
  } | null;
  const ids = (json?.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
  return c.json({ models: ids });
});

models.post('/vertex', (c) =>
  c.json(
    { error: 'Vertex model listing is not supported; add models manually.' },
    501,
  ),
);
