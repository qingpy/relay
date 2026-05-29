# Relay

A light, fast, browser-based multi-provider LLM chat app for personal use — a
quieter, prettier alternative to Cherry Studio. **Local-first:** your data lives
in a single file on your own disk; the network is only for LLM calls and optional
WebDAV sync.

OpenAI-compatible providers (OpenRouter / OpenAI / Groq / local / Gemini AI
Studio) and Google **Vertex AI**, with streaming, branching conversations,
markdown + code + math, file uploads, web search, presets, and export.

## Run it

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev          # Vite + proxy together; open http://localhost:5173
```

Production-style single-origin run:

```bash
npm run build
npm run serve        # serves the built app + /api; open http://localhost:8787
```

The proxy must be running — it owns your data file. If the page shows *"Can't
reach the local data service"*, start `npm run dev` (or `npm run serve`).

Other scripts: `npm run typecheck` (tsc), `npm run dev:web` / `npm run dev:server`
(run one half).

## Your data

Relay's source of truth is **one JSON file on disk**, owned by the proxy — not
the browser's IndexedDB. The browser runs an in-memory store, so nothing persists
to your browser profile.

- Default path: `./data/relay.json` (gitignored). With the repo on D:, that's
  already off your C: drive.
- Change it: set `RELAY_DATA_FILE`, e.g. `RELAY_DATA_FILE=D:\Relay\relay.json`.
- The exact path/size shows in **Settings → Sync & backup**.

For cross-device use, mirror the same snapshot to your own **WebDAV** server in
the same panel (optional, last-write-wins, syncs while the app is open). Portable
JSON **backups** (file download or on-disk) live there too.

## Providers

No login. In **Settings → Connections**, add a connection:

- **Custom (OpenAI-style)** — paste a base URL + API key (OpenRouter, OpenAI,
  Groq, a local server, or Gemini via its OpenAI-compatible endpoint).
- **Vertex AI** — upload/paste a service-account JSON (project, region, key); the
  key stays server-side.

Then a **preset** (sidebar) fixes the model, parameters, and system prompt for the
chats inside it. Per-model capabilities (vision / PDF / reasoning / web / tools)
gate the composer.

## Environment variables (all optional)

| Var | Purpose | Default |
|---|---|---|
| `RELAY_DATA_FILE` | Path to the data snapshot | `./data/relay.json` |
| `API_PORT` | Proxy port | `8787` |
| `RELAY_BACKUP_DIR` | Folder for on-disk backups | `./backups` |
| `OPENROUTER_KEY` / `OPENAI_KEY` | Fallback key for OpenAI-style connections | — |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` | Fallback Vertex service-account | — |

## Stack

React 19 + TypeScript (strict) · Vite 6 · Tailwind v4 · shadcn/Radix · Dexie over
an in-memory IndexedDB · Zustand · Hono proxy (Node via `tsx`). Light footprint —
prefer the platform over libraries.

## More

- **`ARCHITECTURE.md`** — how Relay is built (data model, providers, proxy, the
  local store + sync, decisions, file map).
