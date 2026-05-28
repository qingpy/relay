# LLM Chat — Build Plan

A light, aesthetically pleasant, browser-based LLM chat app for personal use.
Multi-provider (OpenRouter / OpenAI-compatible + Google Gemini AI Studio + Vertex AI),
no login, local-first storage with optional WebDAV sync.

> This document is the single source of truth for the next session. It is written to be
> read **cold** — it assumes no memory of the planning conversation.

---

## 1. Goal & Philosophy

Replace Cherry Studio for daily personal use with something **lighter** and **prettier**,
running in the browser (no dedicated desktop app, no login).

Design north star: **Linear / Vercel-style minimalism** — generous whitespace, subtle
borders, soft shadows, one accent color, clean typography. Fast and quiet, not feature-bloated.

Principles:
- **Local-first**: everything works offline against your own data; the network is only for
  LLM calls and optional sync.
- **Thin server**: the only backend is a tiny request-forwarding proxy. No database, no auth.
- **Provider-agnostic core**: a small abstraction so adding a provider is a single file.
- **Deploy-target-agnostic**: identical code runs locally, on a VPS, or on Cloudflare.

---

## 2. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Build/dev | **Vite** | Fast, static output, simple. |
| UI | **React + TypeScript** | Chosen by user; component model fits this UI. |
| Styling | **Tailwind CSS** | Fast iteration, consistent spacing/scale. |
| UI primitives | **shadcn/ui** (Radix-based, copy-in) | Polished dialogs/menus/tooltips/context-menus for free; light, no heavy dep. |
| Icons | **lucide-react** | Clean, light, consistent. |
| State | **Zustand** | Minimal global store, no boilerplate. |
| Local DB | **Dexie.js (IndexedDB)** | Handles long histories + binary file blobs (localStorage's ~5MB cap is too small). |
| Markdown | **react-markdown** + `remark-gfm` | GitHub-flavored markdown. |
| Code highlight | **rehype-highlight** (or Shiki later) | Code blocks. |
| Math | **remark-math** + **rehype-katex** | Render LaTeX (user uses math regularly). |
| Proxy server | **Hono** | Same code runs on Node (local/VPS), Cloudflare Workers, Bun, Deno. Key to deploy-portability. |
| Vertex auth | **google-auth-library** | Mints OAuth2 access tokens from a service account, server-side only. |

Keep dependencies few. Prefer the platform (fetch, ReadableStream, IndexedDB) over libraries.

---

## 3. Architecture

Two pieces, one repo:

```
┌──────────────────────────────┐         ┌─────────────────────────────┐
│  Frontend SPA (static)       │  /api/* │  Proxy (Hono, thin)         │
│  React + Vite + Tailwind     │ ───────▶│  - forwards LLM requests    │
│  IndexedDB (Dexie)           │         │  - attaches provider auth   │
│  Zustand store               │◀─────── │  - mints Vertex OAuth token │
│                              │ streamed│  - proxies WebDAV sync      │
└──────────────────────────────┘  SSE    └─────────────────────────────┘
```

### Why a proxy at all
- **Vertex AI** authenticates with OAuth2 bearer tokens minted from a **service-account JSON**.
  That secret must never reach the browser, and tokens expire hourly → must be signed server-side.
- **WebDAV** needs server-side credentials + CORS handling.
- OpenRouter and Gemini-AI-Studio are CORS-friendly and *could* be called directly, but routing
  everything through the proxy keeps the client uniform and avoids CORS surprises.

> **Required** for: Vertex, WebDAV.
> **Optional but recommended** for: OpenRouter / OpenAI-compatible / Gemini AI Studio.

### Key / secret handling
- **OpenRouter / OpenAI-compatible / Gemini AI Studio**: API key entered in the **UI**, stored in
  IndexedDB, sent to the proxy per request (proxy forwards it). User can run fully local without
  touching server config.
- **Vertex**: service-account JSON lives **only on the server** (env var / file). The UI just picks
  "Vertex" + a model; it never sees the credential.
- Optionally the proxy may also read keys from its own env as a fallback/override.

### Provider abstraction
A `Provider` interface so each provider is one file:
```ts
interface Provider {
  id: string;
  buildRequest(messages, settings, tools): { url; headers; body };
  parseStreamChunk(raw): Delta;   // text | reasoning | toolCall | citation | usage
  capabilities: {
    vision: boolean; pdf: boolean; reasoning: boolean;
    webSearch: boolean; toolUse: boolean;
  };
}
```
Implementations:
- **`OpenAICompatProvider`** — covers OpenAI, **OpenRouter**, and any OpenAI-compatible base URL
  (configurable `baseUrl`). Reasoning via the `reasoning` field; web search via OpenRouter's
  `:online` suffix or `plugins: [{ id: 'web' }]`.
- **`GeminiProvider`** — AI Studio and Vertex share the `generateContent` body; they differ only in
  **endpoint URL + auth**, decided by the proxy. Web search via `tools: [{ google_search: {} }]`;
  thinking via `thinking`/`thoughts` parts.

A **model picker** fetches model lists where possible (OpenRouter `/models`, Gemini models endpoint)
with a curated, user-editable fallback list.

---

## 4. Data Model (Dexie / IndexedDB)

```
folders   { id, name, parentId|null, order, createdAt }
sessions  { id, folderId|null, title, provider, model,
            settings: { temperature, topP, maxTokens, systemPrompt,
                        reasoningEffort?, thinkingBudget?, webSearch: bool },
            createdAt, updatedAt, order }
messages  { id, sessionId, role: user|assistant|system|divider,
            content: Part[],            // text / image / file refs
            reasoning?: string,         // foldable "thinking"
            toolCalls?: ToolCall[],     // foldable tool/search cards
            citations?: Citation[],
            attachments?: fileId[],
            usage?, createdAt }
files     { id, sessionId, messageId, name, mimeType, size, blob, createdAt }
prompts   { id, title, content, order }      // quick prompts
appConfig { id:'singleton', providerKeys, theme, defaultProvider,
            defaultModel, webdav: { url, user, pass, path, enabled }, ... }
```

- **Context divider** = a `role: 'divider'` message. Messages before the *latest* divider are
  shown in the UI but **excluded** from what's sent to the model. Removing the divider restores
  full context. (Supports the "clear context without clearing the page" requirement.)
- Binary files (images/PDFs) stored as `Blob` in IndexedDB, converted to provider format at send
  time (OpenAI `image_url` base64 / Gemini `inlineData`).

---

## 5. Features → Implementation Notes

1. **Streaming chat** — fetch + `ReadableStream`, parse SSE; render markdown + code highlight + KaTeX.
2. **Thinking / reasoning, foldable** — collapsible panel above the answer, collapsed by default,
   shows token/time. Source differs per provider (OpenRouter `reasoning`, Gemini `thoughts`).
3. **Tool / function calls, foldable** — collapsible card: tool name, args, result. Doubles as the
   web-search results display.
4. **File upload (drag + click)** — drop zone over the composer; images + text + PDF. Per-provider
   capability gating (hide/disable unsupported types). Stored as blobs, converted on send.
5. **Quick prompts** — saved snippets; insert via a `/` palette in the composer; manage in settings.
6. **Web search toggle** — per-session switch that enables the provider's native search
   (OpenRouter `:online`/`plugins`, Gemini `google_search`). Results render as a tool/citation card.
7. **Clear context (keep page)** — insert a context divider (see §4).
8. **Model settings panel** — per-session, provider-aware: temperature, top_p, max_tokens, system
   prompt, reasoning effort / thinking budget where supported.
9. **Folders → sessions sidebar** — tree with create/rename/delete folders; create/rename/delete/move
   sessions (context menu + drag-drop); persisted `order`.
10. **Long-chat navigation** — keyboard + buttons: jump to first/last message, step prev/next **user**
    turn (e.g. `Alt+↑/↓`, `Ctrl+Home/End`). Small floating nav control.
11. **Markdown export** — whole session → `.md` (role headers; optional include-thinking toggle);
    single message → copy or download `.md`.
12. **Storage / sync**
    - **Local**: IndexedDB is the primary store.
    - **WebDAV (on launch)**: compare local `updatedAt` vs remote timestamp; pull if remote newer,
      push if local newer (**last-write-wins**). Manual "Sync now" button too. Sync payload = JSON
      export of the DB (+ files). Through the proxy `/api/sync` (GET/PUT) to dodge CORS.
      **Safety**: write a timestamped backup before any overwrite; warn on conflict.

---

## 6. Proxy (Hono) — Endpoints

```
POST /api/chat/openai      # OpenRouter / OpenAI-compatible passthrough (key from client or env)
POST /api/chat/gemini      # AI Studio passthrough (key from client or env)
POST /api/chat/vertex      # mint OAuth token from service-account env, call Vertex
GET  /api/sync             # read WebDAV JSON blob
PUT  /api/sync             # write WebDAV JSON blob (with server-side backup)
GET  /api/models/:provider # optional: proxy model lists
```
- Streams provider SSE straight back to the client.
- Single source file ~150–250 lines. No state, no DB.
- Env: `OPENROUTER_KEY?`, `GEMINI_KEY?`, `GOOGLE_APPLICATION_CREDENTIALS` (or inline JSON),
  `VERTEX_PROJECT`, `VERTEX_LOCATION`, `WEBDAV_URL/USER/PASS`.

---

## 7. Deployment

Identical SPA + proxy for all targets. Pick later.

- **Local (dev & simplest run)**: `vite` dev server + proxy via `tsx`/`node`; Vite `server.proxy`
  forwards `/api` → proxy port. Nothing leaves your machine.
- **VPS (recommended for always-on)**: build SPA → static files; Hono serves both static + `/api`
  (single origin → **zero CORS**); run under systemd or pm2; **Caddy** in front for automatic HTTPS.
  Co-locate a WebDAV target on the same box for trivial sync.
- **Cloudflare Pages + Functions (zero-maintenance fallback)**: SPA on Pages, Hono proxy as Pages
  Functions, secrets in env vars. Free, HTTPS automatic.

---

## 8. Milestones (suggested build order)

- **M0 — Scaffold**: Vite + React + TS + Tailwind + shadcn/ui; Hono proxy; dev proxy wiring; base
  layout (sidebar + chat pane); Dexie schema.
- **M1 — Core chat**: provider abstraction (OpenAI-compat + Gemini); streaming; markdown/code/math
  render; persist messages.
- **M2 — Sessions & folders**: sidebar tree CRUD, rename/move/delete, ordering, persistence.
- **M3 — Rich rendering**: foldable thinking; foldable tool calls; citations.
- **M4 — Composer & UX**: file upload (drag+click); quick prompts; model-settings panel; web-search
  toggle; context divider; long-chat navigation shortcuts.
- **M5 — Export**: session + single-message markdown.
- **M6 — Sync**: WebDAV via proxy; launch-time last-write-wins; backups; settings UI.
- **M7 — Polish & deploy**: light theme (+ optional dark), empty states, error handling, keyboard
  shortcuts, then deploy to VPS (Caddy) or Cloudflare.

A usable daily driver exists after **M4**; M5–M7 are quality-of-life.

---

## 9. Open Decisions for Next Session

- **Project name** (working title `llm-chat`). Pick a real one before scaffolding.
- **Theme**: light-only first, or light+dark from the start?
- **Default provider/model** to preselect.
- **Deploy target** to optimize for first (local vs VPS vs Cloudflare) — affects only deploy config.
- Confirm **Vertex** project/location/region and that a service-account JSON is available.

## 10. First Steps (when you open the new session)

1. Copy this `PLAN.md` into the new project folder.
2. Scaffold: `npm create vite@latest . -- --template react-ts`, add Tailwind + shadcn/ui + Dexie +
   Zustand + react-markdown stack + Hono.
3. Wire Vite dev `server.proxy` `/api` → Hono.
4. Build M0 layout, then proceed through milestones.
5. `git init`, create a **private** GitHub repo, push.
