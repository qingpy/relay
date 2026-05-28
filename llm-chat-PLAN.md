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
connections { id, name, type: openai|gemini|vertex,   // user-defined upstream
              baseUrl?, apiKey?,                       // key lives in IndexedDB
              models: SavedModel[],                    // { id, label?, capabilities }
              project?, region?,                       // vertex (auth JSON is server-side)
              order, createdAt }
folders   { id, name, parentId|null, order, createdAt,  // a "Preset" in the UI
            connectionId?, model?,                    // fixes the model for its chats
            settings?: { temperature, topP, maxTokens, reasoningEffort?, thinkingBudget? },
            systemPrompt? }                           // shared, prepended to each chat's
sessions  { id, folderId|null, title,                 // folderId = preset (sets model)
            systemPrompt?,              // per-chat, appended to preset's
            webSearch?,                 // per-chat toggle
            currentLeafId?,             // active branch tip (see Branching)
            createdAt, updatedAt, order }
messages  { id, sessionId, parentId|null,   // tree edge -> enables branching
            role: user|assistant|system|divider,
            content: Part[],            // text / image / file refs
            reasoning?: string,         // foldable "thinking"
            reasoningMs?: number,       // time spent thinking
            toolCalls?: ToolCall[],     // foldable tool/search cards
            citations?: Citation[],
            attachments?: fileId[],
            model?,                     // model id that produced the answer
            usage?, createdAt }
files     { id, sessionId, messageId, name, mimeType, size, blob, createdAt }
prompts   { id, title, content, order }      // quick prompts
appConfig { id:'singleton', theme, defaultConnectionId?,
            exportIncludeThinking?,                   // include reasoning in exports
            titleConnectionId?, titleModel?, titlePrompt?,   // auto-titling
            webdav: { url, user, pass, path, enabled }, ... }
```

- **Connections & presets (M7-pre redesign).** Upstreams are user-defined **connections** (name +
  protocol + key/URL + a saved **model catalog** with per-model capabilities, detected via the proxy
  and editable). A **Preset** (stored as a folder) fixes the connection, model, settings, and a shared
  system prompt for the chats inside it; a chat only adds an extra system prompt + a web-search
  toggle. Loose chats use the default connection's first model. Capabilities gate the composer
  (vision/pdf/web). Migration v3 turns old provider keys into connections and seeds presets/chats.

- **Context divider** = a `role: 'divider'` message. Messages before the *latest* divider are
  shown in the UI but **excluded** from what's sent to the model. Removing the divider restores
  full context. (Supports the "clear context without clearing the page" requirement.)
- Binary files (images/PDFs) stored as `Blob` in IndexedDB, converted to provider format at send
  time (OpenAI `image_url` base64 / Gemini `inlineData`).
- **Branching (tree).** Each message has a `parentId`, so a session is a *tree* of messages, not a
  flat list. The displayed conversation is the path from the root to the session's `currentLeafId`.
  Regenerating, editing a user turn, or forking creates a **sibling** under the same parent and moves
  `currentLeafId` to the new branch — nothing is destroyed, every branch stays reachable. A tree
  **overview map** lets you see all branches and jump `currentLeafId` to any node. Linear chats are
  just a tree with no siblings. (Migration: existing messages get `parentId` = the previous message
  in `createdAt` order.)

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
11. **Markdown export & copy** — whole session → `.md` (role headers; optional include-thinking
    toggle); single message → download `.md` or **copy the whole message as markdown**. **Copy
    selected lines**: selecting text inside a rendered message and copying yields clean markdown,
    and any rendered LaTeX copies back as its `$…$` source (KaTeX `copy-tex`).
12. **Message actions** — per message, on hover/menu:
    - **Regenerate** (assistant) — new sibling response under the same parent; `currentLeafId` moves
      to it. Old response stays as an alternate branch.
    - **Edit input** (user) — edit the text and resend; creates a sibling user turn + fresh reply.
    - **Delete** — remove a message (and its subtree) from the session.
    - **Fork** — branch the conversation from any message into a new line of replies.
13. **Branch / tree navigation** — a session **overview map** of the message tree; click any node to
    set it as the active path (`currentLeafId`). Sibling switcher (e.g. `‹ 2/3 ›`) on messages that
    have alternates. See §4 *Branching*.
14. **Duplicate session** — clone a whole session (messages + tree + files) into a new session.
15. **Storage / sync — DEFERRED** (was M6). WebDAV last-write-wins sync via the proxy is postponed;
    JSON export/import of the whole DB may land earlier as a manual backup. Design retained below.

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
- **M5 — Export & copy**: session + single-message markdown export; copy whole message as markdown;
  copy selected lines with LaTeX-aware copy (KaTeX `copy-tex`).
- **M6 — Message actions & branching** ✅: regenerate, edit-input-and-resend, delete (subtree), fork;
  message tree (`parentId` + session `currentLeafId`); sibling switcher; session **overview map**
  (Branch map dialog) to jump to any branch; duplicate whole session. (Replaces the old WebDAV-sync M6.)
- **M7 — Polish & deploy**: light theme (+ optional dark), empty states, error handling, keyboard
  shortcuts, bundle code-splitting, then deploy to VPS (Caddy) or Cloudflare.
- **Deferred — WebDAV sync**: last-write-wins sync via the proxy + backups + settings UI (see §5.15
  / §6). Postponed at the user's request; revisit after M7.

A usable daily driver exists after **M4**; M5–M7 are quality-of-life.

---

## 9. Decisions (resolved) & still-open

Resolved:
- **Project name**: **Relay**.
- **Theme**: **light + dark from the start** (CSS variables + `.dark`, `system` default).
- **Default provider/model**: **OpenRouter**, model `openai/gpt-4o-mini`. Provider ids
  are `openrouter | openai | gemini | vertex`; OpenRouter and OpenAI share
  `OpenAICompatProvider` (differ by base URL).

- **WebDAV sync deferred** (user request, 2026-05-28). M6 is now *message actions & branching*;
  sync moves to a post-M7 "Deferred" milestone.
- **Connections & presets redesign** (user request, 2026-05-28): fixed providers replaced by
  user-defined **connections** (multiple per protocol, custom name/URL/key, saved model catalog with
  per-model capabilities); folders became **Presets** that fix the model/settings/system-prompt for
  their chats (**workspace-only model** — a chat adds only an extra system prompt + web-search
  toggle). The old global "default model" setting is gone. **Vertex**: framework only (server-side
  service-account JSON via `GOOGLE_VERTEX_CREDENTIALS`; client sends project/region/model).
  **Auto-title** uses a configurable connection/model + prompt.
- **Redesign refinements** (user request, 2026-05-28): **presets-only** — no folders/loose chats;
  every chat lives in a preset (v4 migration adopts loose chats; deleting a preset rehomes its chats;
  the chat header switches the model, which updates the whole preset). **Connections** are edited as
  **raw JSON** (name/type/baseUrl/apiKey/project/region) for flexibility. **Detect** opens a
  searchable picker to save a *subset* of the (possibly 100+) available models, not all of them.
  **Timestamps** are absolute (date + time). The **tree map** can delete any message/branch.
- **Branching model**: messages form a tree via `parentId`; the session's `currentLeafId` selects
  the visible path. Regenerate / edit / fork create siblings (non-destructive); a tree overview map
  navigates between branches. Implementation choices (M6):
  - **Fork** = "Branch from here": sets `currentLeafId` to that message so the next turn starts a new
    branch under it. Existing replies stay reachable as alternates.
  - **Branch map** node click descends to that node's leaf (`leafOf`) so a full branch becomes active,
    rather than truncating at the clicked node (that's what Fork is for).
  - **Delete** removes the message *and its whole subtree* (`deleteSubtree`); confirms only when the
    message has replies below it. **Restore divider** uses `spliceMessage` (re-parents children).
  - **Edit & resend** clones the original turn's attachments (`cloneAttachments`) so deleting the old
    branch can't orphan the new turn's files.
  - DB migration v2 backfills `parentId` as a linear chain per session and points `currentLeafId` at
    each session's last message.

Still open:
- **Deploy target** to optimize for first (local vs VPS vs Cloudflare) — affects only deploy config.
- Confirm **Vertex** project/location/region and that a service-account JSON is available
  (Vertex provider is registered but not yet implemented).

## 10. First Steps (when you open the new session)

1. Copy this `PLAN.md` into the new project folder.
2. Scaffold: `npm create vite@latest . -- --template react-ts`, add Tailwind + shadcn/ui + Dexie +
   Zustand + react-markdown stack + Hono.
3. Wire Vite dev `server.proxy` `/api` → Hono.
4. Build M0 layout, then proceed through milestones.
5. `git init`, create a **private** GitHub repo, push.
