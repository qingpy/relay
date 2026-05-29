import { Hono } from 'hono';
import { getWebdavPass } from './secrets.ts';

/**
 * WebDAV sync proxy. The browser can't reach most WebDAV servers directly
 * (CORS + Basic-auth), so it sends the target URL + username here and we
 * forward GET/PUT to the user's server. The password is a secret: it lives in
 * the proxy's secret store (never in the snapshot / browser), and we assemble
 * the `Authorization: Basic` header here.
 *
 * Client headers:
 *   x-webdav-url   full target URL (the snapshot file for GET/PUT, the folder for /test)
 *   x-webdav-user  WebDAV username (non-secret config)
 *   x-webdav-pass  transient password — only sent for /test (an unsaved password);
 *                  otherwise the stored password is used.
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

async function creds(c: { req: { header: (k: string) => string | undefined } }) {
  const url = safeUrl(c.req.header('x-webdav-url'));
  const user = c.req.header('x-webdav-user');
  // Transient password (testing an unsaved one) wins over the stored secret.
  const pass = c.req.header('x-webdav-pass') || (await getWebdavPass());
  const authHeader =
    user && pass
      ? `Basic ${Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64')}`
      : undefined;
  return { url, authHeader };
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
  const { url, authHeader } = await creds(c);
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
  const { url, authHeader } = await creds(c);
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
  const { url, authHeader } = await creds(c);
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
