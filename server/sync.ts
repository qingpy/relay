import { Hono } from 'hono';
import { getWebdavPass } from './secrets.ts';

/**
 * WebDAV sync proxy. The browser can't reach most WebDAV servers directly
 * (CORS + Basic-auth), so it sends the target URL + username here and we forward
 * GET/PUT (the live snapshot + versioned backups), PROPFIND (`/list`, to
 * enumerate backups) and DELETE (to prune them). The password is a secret: it
 * lives in the proxy's secret store (never in the snapshot / browser), and we
 * assemble the `Authorization: Basic` header here.
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

/** Parent collection URL (strip any trailing slash, then the last segment).
 *  Robust whether or not the input already ends in `/`. */
function parentUrl(fileUrl: string): string {
  const u = new URL(fileUrl);
  u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/[^/]*$/, '/');
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

  // Best-effort: ensure the parent chain exists (WebDAV MKCOL isn't recursive).
  // Two levels covers a folder + its `backups/` subfolder; existing collections
  // just return 405/301, which we ignore. PUT surfaces any real failure.
  const parent = parentUrl(url);
  for (const dir of [parentUrl(parent), parent]) {
    try {
      await fetch(dir, { method: 'MKCOL', headers: { authorization: authHeader } });
    } catch {
      /* ignore */
    }
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

// List a collection (PROPFIND, depth 1) — used to enumerate versioned backups.
// Returns the raw multistatus XML for the client to parse; a missing folder
// (404) is reported as empty, not an error.
sync.post('/list', async (c) => {
  const { url, authHeader } = await creds(c);
  if (!url || !authHeader) return err('Missing WebDAV URL or credentials.');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PROPFIND',
      headers: { authorization: authHeader, depth: '1' },
    });
  } catch (e) {
    return err(`WebDAV request failed: ${String(e)}`, 502);
  }
  if (res.status === 404) return c.json({ xml: '' });
  if (!res.ok) return err((await res.text().catch(() => '')) || res.statusText, res.status);
  return c.json({ xml: await res.text() });
});

// Delete a file (used to prune old backups). A missing file is a no-op.
sync.delete('/', async (c) => {
  const { url, authHeader } = await creds(c);
  if (!url || !authHeader) return err('Missing WebDAV URL or credentials.');
  let res: Response;
  try {
    res = await fetch(url, { method: 'DELETE', headers: { authorization: authHeader } });
  } catch (e) {
    return err(`WebDAV delete failed: ${String(e)}`, 502);
  }
  if (!res.ok && res.status !== 404) {
    return err((await res.text().catch(() => '')) || res.statusText, res.status);
  }
  return c.json({ ok: true });
});
