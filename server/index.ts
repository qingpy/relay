import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { backup } from './backup.ts';
import { chat } from './chat.ts';
import { data } from './data.ts';
import { models } from './models.ts';
import { secrets } from './secrets.ts';
import { sync } from './sync.ts';

/**
 * Relay proxy — a thin, stateless request forwarder (ARCHITECTURE.md §6).
 *
 * In dev, Vite serves the SPA and forwards `/api/*` here. In production
 * (`npm run build && npm run serve`) this same process also serves the built
 * SPA from `dist/`, giving a single origin with zero CORS.
 */

const PORT = Number(process.env.API_PORT ?? 8787);
// Local-only by default, like Vite / Jupyter / Ollama: the proxy holds keys and
// has no login. `HOST=0.0.0.0` (the Docker image sets it) opts into the network.
const LOCAL_ONLY = !process.env.HOST?.trim();
// Local-only listens on both loopbacks: Windows resolves `localhost` to ::1
// first, and a client that waits out a dead ::1 before trying 127.0.0.1 is
// seconds slow per request.
const HOSTS = LOCAL_ONLY ? ['127.0.0.1', '::1'] : [process.env.HOST!.trim()];
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const app = new Hono();

const api = new Hono();

// Cross-site guard: a page on another site can fire simple requests at this
// proxy (no CORS preflight for text/plain), which would spend the stored API
// keys or read nothing but still act. Browsers always send `Origin` on those;
// it must name this host (loopback names count as one). Local-only, the Host
// itself must be loopback too: that stops DNS rebinding (a site pointing its
// own name at 127.0.0.1 to look same-origin).
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostname = (v: string) => {
  try {
    return new URL(v.includes('://') ? v : `http://${v}`).hostname;
  } catch {
    return '';
  }
};
api.use('*', async (c, next) => {
  const self = hostname(c.req.header('host') ?? '');
  if (LOCAL_ONLY && !LOOPBACK.has(self)) {
    return c.json({ error: 'Host refused (Relay is local-only; set HOST to serve a network).' }, 403);
  }
  const origin = c.req.header('origin');
  if (origin) {
    const from = hostname(origin);
    const same = from === self || (LOOPBACK.has(from) && LOOPBACK.has(self));
    if (!same) return c.json({ error: 'Cross-origin request refused.' }, 403);
  }
  await next();
});

api.get('/health', (c) =>
  c.json({ ok: true, service: 'relay-proxy', time: Date.now() }),
);
api.route('/chat', chat);
api.route('/models', models);
api.route('/backup', backup);
api.route('/sync', sync);
api.route('/data', data);
api.route('/secrets', secrets);
app.route('/api', api);

// Serve the built SPA in production (no-op in dev — dist/ won't exist).
if (existsSync(DIST_DIR)) {
  app.use('/*', serveStatic({ root: DIST_DIR }));
  // SPA fallback: any non-API, non-file route returns index.html.
  app.get('*', async (c) => {
    const html = await readFile(join(DIST_DIR, 'index.html'), 'utf-8');
    return c.html(html);
  });
}

for (const [i, hostname] of HOSTS.entries()) {
  const server = serve({ fetch: app.fetch, port: PORT, hostname }, (info) => {
    if (i > 0) return;
    console.log(
      LOCAL_ONLY
        ? `[relay] proxy listening on http://localhost:${info.port} (this machine only)`
        : `[relay] proxy listening on ${hostname}:${info.port} (network; no login, trusted networks only)`,
    );
  });
  // A machine with IPv6 off has no ::1; 127.0.0.1 alone still serves.
  if (i > 0) server.on('error', () => undefined);
}
