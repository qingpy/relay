import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { backup } from './backup.ts';
import { chat } from './chat.ts';
import { models } from './models.ts';

/**
 * Relay proxy — a thin, stateless request forwarder (plan §6).
 *
 * In dev, Vite serves the SPA and forwards `/api/*` here. In production
 * (`npm run build && npm run serve`) this same process also serves the built
 * SPA from `dist/`, giving a single origin with zero CORS.
 *
 * LLM passthrough (`/api/chat/*`), model lists, and WebDAV sync are added in
 * later milestones; M0 establishes the server and the dev proxy wiring.
 */

const PORT = Number(process.env.API_PORT ?? 8787);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const app = new Hono();

const api = new Hono();
api.get('/health', (c) =>
  c.json({ ok: true, service: 'relay-proxy', time: Date.now() }),
);
api.route('/chat', chat);
api.route('/models', models);
api.route('/backup', backup);
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

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[relay] proxy listening on http://localhost:${info.port}`);
});
