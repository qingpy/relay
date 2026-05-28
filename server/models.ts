import { Hono } from 'hono';
import { errorResponse, safeBaseUrl } from './chat.ts';

/**
 * Model-discovery routes. The proxy lists upstream models so the client can
 * populate a connection's catalog. (Vertex listing isn't offered — add Vertex
 * models manually.)
 */
export const models = new Hono();

models.post('/openai', async (c) => {
  const { baseUrl: rawBase } = await c.req
    .json<{ baseUrl?: string }>()
    .catch(() => ({ baseUrl: undefined }));
  const baseUrl = safeBaseUrl(rawBase);
  if (!baseUrl) return errorResponse('Invalid or missing baseUrl.', 400);

  const key =
    c.req.header('x-api-key') ||
    process.env.OPENROUTER_KEY ||
    process.env.OPENAI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
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

models.post('/gemini', async (c) => {
  const key = c.req.header('x-api-key') || process.env.GEMINI_KEY;
  if (!key) return errorResponse('No API key provided.', 401);

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`,
    );
  } catch (err) {
    return errorResponse(`Model list failed: ${String(err)}`, 502);
  }
  if (!res.ok) {
    return errorResponse(await res.text().catch(() => res.statusText), res.status);
  }
  const json = (await res.json().catch(() => null)) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  } | null;
  const ids = (json?.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((id) => !!id);
  return c.json({ models: ids });
});

models.post('/vertex', (c) =>
  c.json(
    { error: 'Vertex model listing is not supported; add models manually.' },
    501,
  ),
);
