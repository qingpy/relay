import { Hono } from 'hono';

/**
 * WebDAV sync proxy. The browser can't reach most WebDAV servers directly
 * (CORS + Basic-auth), so it sends the target URL and credentials here per
 * request (nothing is stored) and we forward GET/PUT to the user's server.
 * This keeps Relay local-first: sync is optional and the proxy is stateless.
 *
 * Client headers:
 *   x-webdav-url   full target URL (the snapshot file for GET/PUT, the folder for /test)
 *   x-webdav-auth  base64("user:pass"), sent upstream as `Authorization: Basic …`
 */
export const sync = new Hono();

function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

function creds(c: { req: { header: (k: string) => string | undefined } }) {
  const url = safeUrl(c.req.header('x-webdav-url'));
  const auth = c.req.header('x-webdav-auth');
  return { url, authHeader: auth ? `Basic ${auth}` : undefined };
}

function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Parent collection URL of a file URL (strip the last path segment). */
function parentUrl(fileUrl: string): string {
  const u = new URL(fileUrl);
  u.pathname = u.pathname.replace(/\/[^/]*$/, '/');
  return u.toString();
}

// Verify the endpoint + credentials (PROPFIND the folder).
sync.post('/test', async (c) => {
  const { url, authHeader } = creds(c);
  if (!url || !authHeader) return err('Missing WebDAV URL or credentials.');
  try {
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { authorization: authHeader, depth: '0' },
    });
    // 207 Multi-Status = good; 405/301 = exists but no PROPFIND; 200 = listing.
    const ok = [200, 207, 301, 405].includes(res.status);
    return c.json({ ok, status: res.status }, ok ? 200 : 502);
  } catch (e) {
    return err(`Couldn't reach WebDAV: ${String(e)}`, 502);
  }
});

// Download the snapshot. 404 -> nothing stored yet.
sync.get('/', async (c) => {
  const { url, authHeader } = creds(c);
  if (!url || !authHeader) return err('Missing WebDAV URL or credentials.');
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: authHeader } });
  } catch (e) {
    return err(`WebDAV request failed: ${String(e)}`, 502);
  }
  if (res.status === 404) return c.json({ found: false }, 404);
  if (!res.ok) return err((await res.text().catch(() => '')) || res.statusText, res.status);
  return new Response(await res.text(), {
    headers: { 'content-type': 'application/json' },
  });
});

// Upload the snapshot (creating the folder first if needed).
sync.put('/', async (c) => {
  const { url, authHeader } = creds(c);
  if (!url || !authHeader) return err('Missing WebDAV URL or credentials.');
  const body = await c.req.text();
  if (!body) return err('Empty body.');

  // Best-effort: ensure the parent folder exists (ignore "already there").
  try {
    await fetch(parentUrl(url), { method: 'MKCOL', headers: { authorization: authHeader } });
  } catch {
    /* ignore — PUT will report the real error if the folder truly can't be made */
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body,
    });
  } catch (e) {
    return err(`WebDAV upload failed: ${String(e)}`, 502);
  }
  if (!res.ok) return err((await res.text().catch(() => '')) || res.statusText, res.status);
  return c.json({ ok: true });
});
