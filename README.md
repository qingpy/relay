# Relay

English | [中文](README.zh-CN.md)

A light, fast, browser-based multi-provider LLM chat app for personal use.
Local-first: your data is one JSON file on your own disk; the network carries
only LLM calls and optional WebDAV sync.

Works with any OpenAI-compatible provider and Google Vertex AI. Streaming,
branching conversations, markdown/code/math, file uploads, web search,
presets, export.

![Demo](demo.jpeg)

## Run with Docker

```bash
docker run -d --name relay -p 8787:8787 -v relay-data:/data \
  ghcr.io/qingpy/relay:latest
```

Open http://localhost:8787. Snapshot, keys, and backups live in the
`relay-data` volume; bind-mount `-v /path/on/host:/data` to see them. Keep it
local: the proxy has no auth, so anyone reaching the port can use your keys.

## Run prebuilt

Node 20+, no build step: download `relay-x.y.z.zip` from the
[latest release](https://github.com/qingpy/relay/releases/latest), unzip, run
`node server-dist/index.js`, open http://localhost:8787.

## Run from source

Node 20+.

```bash
npm install
npm run dev      # Vite + proxy; open http://localhost:5173
```

Production: `npm run build && npm run serve` (app + API on one origin,
:8787). The proxy must run; it owns your data file. Also `npm run typecheck`,
`npm run dev:web` / `dev:server`.

## Your data

One proxy-owned JSON file is the source of truth (default `./data/relay.json`;
the browser holds only an in-memory copy). Path and size show in Settings →
Sync & backup.

Secrets (API keys, Vertex private key, WebDAV password) live in a separate
proxy-owned store, so the data file, backups, and WebDAV mirror are
credential-free and safe to copy; a new device re-enters keys.

Optional WebDAV sync mirrors the snapshot across devices (last-write-wins,
while the app is open) and keeps rolling timestamped backups. Portable JSON
backups work by download or on disk.

## Providers

No login. In Settings → Connections add:

- Custom: a full OpenAI-compatible URL (e.g. `…/v1/chat/completions`) + API
  key.
- Vertex AI: paste a service-account JSON; the key stays server-side.

Presets fix model, parameters, and system prompt for their chats; per-model
capabilities (vision, PDF, reasoning, web, tools) gate the composer.

## Environment variables (all optional)

| Variable                              | Purpose                                   | Default             |
| ------------------------------------- | ----------------------------------------- | ------------------- |
| `RELAY_DATA_FILE`                     | Data snapshot path                        | `./data/relay.json` |
| `RELAY_SECRETS_FILE`                  | Secret store (keys + WebDAV password)     | per-user config dir |
| `API_PORT`                            | Proxy port                                | `8787`              |
| `RELAY_BACKUP_DIR`                    | On-disk backup folder                     | `./backups`         |
| `OPENROUTER_KEY` / `OPENAI_KEY`       | Fallback key for OpenAI-style connections | -                   |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` | Fallback Vertex service account           | -                   |

## Stack

React 19, TypeScript strict, Vite 6, Tailwind v4, shadcn/Radix, Dexie over an
in-memory IndexedDB, Zustand, Hono proxy on Node. Few dependencies. See
ARCHITECTURE.md for how it's built.

---

Thanks to the [linux.do](https://linux.do/) community.
