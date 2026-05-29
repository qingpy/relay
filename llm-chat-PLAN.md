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
connections { id, name, type: openai|vertex,          // user-defined upstream
              baseUrl?, apiKey?,                       // key lives in IndexedDB
              models: SavedModel[],                    // { id, label?, capabilities }
              project?, region?,                       // vertex (auth JSON is server-side)
              enabled?,                                // off = hidden from model pickers
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
appConfig { id:'singleton', theme,
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
- Env (all optional; UI-entered keys take precedence): `API_PORT`; `OPENROUTER_KEY` / `OPENAI_KEY`
  (fallback for OpenAI-compatible connections + model listing); `GOOGLE_VERTEX_CREDENTIALS` (inline
  service-account JSON) or `GOOGLE_VERTEX_CREDENTIALS_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` (path)
  — fallback when a Vertex connection has no client_email/private_key; `RELAY_BACKUP_DIR`
  (default `./backups`).

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

- **M0 — Scaffold** ✅: Vite + React + TS + Tailwind + shadcn/ui; Hono proxy; dev proxy wiring; base
  layout (sidebar + chat pane); Dexie schema.
- **M1 — Core chat** ✅: provider abstraction; streaming; markdown/code/math render; persist messages.
- **M2 — Sessions & folders** ✅: sidebar tree CRUD, rename/move/delete, ordering, persistence.
- **M3 — Rich rendering** ✅: foldable thinking; foldable tool calls; citations.
- **M4 — Composer & UX** ✅: file upload (drag+click+paste); quick prompts; model settings; web-search
  toggle; context divider; long-chat navigation shortcuts.
- **M5 — Export & copy** ✅: session + single-message markdown export; copy whole message as markdown;
  copy selected lines with LaTeX-aware copy (KaTeX `copy-tex`).
- **M6 — Message actions & branching** ✅: regenerate, edit, delete (subtree), fork; message tree
  (`parentId` + session `currentLeafId`); sibling switcher; Branch-map dialog; duplicate session.
- **M6.5 — Connections / presets / backup redesign** ✅ (post-M6, rounds 1–8): user-defined
  connections (Custom OpenAI-style + Vertex) with per-model capabilities & test; presets (model +
  settings + system prompt) with active-preset switching; backup & restore (file + local server +
  scheduled); auto-title; multi-select (messages, branch map, sidebar chats). See §9 decisions.
- **M7 — UI/design polish** ✅: **visual redesign** ("Unboxed Stationery": strictly-flat,
  slate-on-grey, light-only, block-style messages, uppercase-mono labels, "input horizon" composer;
  see §9). **code-splitting** (one ~1.19 MB chunk → ~540 KB initial; the markdown stack —
  KaTeX/highlight.js/remark/rehype — and Settings load on demand). **error/retry & a11y**
  (inline error + **Retry** on a failed turn; `role=alert`/`role=status`/`aria-busy` cues).
  **keyboard help** (`?` or the header **Keys** link; ⌘/Ctrl+B toggles the sidebar).
  **responsive** (the sidebar overlays the chat below `md`, starts closed there, auto-dismisses on
  open). **per-model reasoning effort** (free-typed; see §9).
- **M8 — Local + WebDAV sync** ⏳ (built; pending the user's live test): Relay stays **local-first
  and run locally** — a public server deployment was built then **reverted** (see §9): requiring a
  network round-trip to a VPS just to open the chat app runs against the local-first principle.
  Cross-device continuity comes from **WebDAV sync** through the local proxy (`/api/sync`): a
  stateless WebDAV forwarder (`server/sync.ts`, GET/PUT/PROPFIND with the user's creds, MKCOL the
  folder on first push); a client engine (`src/lib/webdav.ts`) that mirrors the whole DB as one
  snapshot file — pull on open, scheduled push while open, last-write-wins with guards so a fresh
  device can't clobber the cloud nor the cloud clobber unsynced local edits; configured on the page
  (**Settings → Sync & backup**: URL/user/pass/folder/interval, Test, Sync now, Back up, Restore).
  Proxy verified end-to-end against a stub; the user wires their own WebDAV server + tests live.

The functional build is complete through **M7** (and verified by the user); **M8** (local + WebDAV
sync) is the remaining stage.

### Status & handoff (2026-05-28)

**State:** functionally complete; user has verified behavior. `tsc --noEmit` and `vite build` are
clean. Verified in-session via fake-indexeddb tests (Dexie migrations v2–v5, config resolution,
backup round-trip) and server smokes (chat proxy, Vertex token mint, model listing, backup CRUD).
Working tree clean; all work pushed to `origin/main`.

**M7 polish is done:**
- ✅ Visual redesign — the flat "Unboxed Stationery" light theme (see §9).
- ✅ Code-splitting — lazy Markdown (+ KaTeX as its own parallel chunk) and lazy SettingsDialog;
  `manualChunks` peels React out for caching. Initial JS ~540 KB (was one ~1.19 MB chunk).
- ✅ Error/retry & a11y — failed turns show an inline error with a **Retry** that re-runs from the
  prompting user message; streaming/error states carry aria cues.
- ✅ Keyboard help & responsive — a `?` shortcut sheet (also the header **Keys** link) plus
  ⌘/Ctrl+B; the sidebar overlays the chat on narrow screens.
- ✅ Per-model reasoning effort — free-typed, gated by capability (see §9).

**Deployment reverted (2026-05-29).** A public VPS deployment (Oracle Ampere + Caddy auto-HTTPS +
HTTP Basic gate, served from the Hono server) was built and went live, then **torn down at the
user's request** — needing to reach a server over the internet just to open the chat app conflicts
with the local-first design. The VPS was returned to its pre-deploy state (Node/Caddy/app removed)
and the deploy kit (`DEPLOY.md`, `deploy/`, the proxy auth gate) was removed from the repo.

**Next — M8: local + WebDAV sync.** Relay runs locally (`npm run dev`, or `npm run build` + `npm run
serve`). Cross-device continuity + backup come from **WebDAV** through the local proxy (`/api/sync`):
the browser holds the data (IndexedDB), and a whole-DB snapshot syncs to the user's WebDAV store
opportunistically (last-write-wins, single user). The proxy mediates so there's no CORS/credential
exposure in the browser. WebDAV target/credentials are the user's to provide (Nextcloud, a NAS, a
hosted WebDAV, etc.).

**Carry-over notes / caveats:**
- Backups contain API keys in plaintext (gitignored). The proxy has **no auth** — fine for the
  intended **local** use; do not expose it publicly without a gate.
- Scheduled backups run only while a tab is open (data lives in the browser).
- An empty preset is configured after it has a chat (header gear); new presets auto-seed the first
  enabled connection's first model.
- Native Gemini AI Studio is reached via its OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai`), not a dedicated type.

---

## 9. Decisions (resolved) & still-open

Resolved:
- **Project name**: **Relay**.
- **Theme**: **light only** as of the M7 redesign (2026-05-28). The dark palette
  and the theme toggle were removed at the user's request; the app is the flat
  "Unboxed Stationery" light theme (CSS variables, no `.dark`).
- **Default provider/model**: **OpenRouter**, model `openai/gpt-4o-mini`. Provider ids
  are `openrouter | openai | gemini | vertex`; OpenRouter and OpenAI share
  `OpenAICompatProvider` (differ by base URL).

- **Reasoning effort is free-typed, per model** (user request, M7, 2026-05-28): the accepted set
  varies by model (GPT-5 adds `minimal`, xAI mini reasoners only do `low`/`high`, DeepSeek-R1 /
  grok-4 / QwQ reason with no knob), so a fixed Off/Low/Medium/High dropdown was wrong. The preset
  editor now shows a **text field** the user types (`reasoningEffort: string`); the control is
  **gated on the model's saved `reasoning` capability** and split by protocol via
  `reasoningKind(type, caps)` — `none` (no knob), `budget` (Vertex numeric `thinkingBudget`), or
  `effort` (the typed string). `sanitizeReasoning()` strips the inapplicable knob at the resolve
  boundary, so a stale value (after a model switch / backup import / migration) is never sent.

- **UI redesign — "Unboxed Stationery"** (user request, M7, 2026-05-28): replaced the indigo
  Linear/Vercel look with a **strictly-flat editorial** aesthetic — airy grey canvas, hairline
  borders, **no shadows or rounded corners**, a single calm **slate-blue** accent, and
  **uppercase-monospace** labels/metadata. Messages render as **left-aligned labeled blocks** (role
  marker + label + metadata header, indented content, marginalia action links) for both roles; the
  composer is a white **"input horizon"** strip with a monospace SEND. Palette is limited to
  **black / white / grey / slate-blue** (indigo and red dropped → "destructive" renders as ink, with
  the trash icon + confirm dialog carrying the danger cue). **Dark mode removed** (light only). New
  favicon (flat slate mark). Repetition removed via shared primitives: `CheckSquare` (one selection
  box for sidebar/message/model-picker/branch-map), `Marginalia` (uppercase-mono text actions), and
  `SectionLabel` (settings headings). All re-skin flows through `src/index.css` tokens (a `--radius`
  of 0, neutralized shadow scale, and a `label-mono` utility), so the palette/finish live in one file.

- **WebDAV sync — reinstated as M8** (user request, 2026-05-29). Originally M6, then deferred in
  favor of local backup; now the chosen path for cross-device continuity after the public-server
  deployment was reverted (below). Local-first stays the model; WebDAV is opportunistic sync/backup
  through the local proxy (`/api/sync`, §6) to the user's own WebDAV store.
- **Connections & presets redesign** (user request, 2026-05-28): fixed providers replaced by
  user-defined **connections** (multiple per protocol, custom name/URL/key, saved model catalog with
  per-model capabilities); folders became **Presets** that fix the model/settings/system-prompt for
  their chats (**workspace-only model** — a chat adds only an extra system prompt + web-search
  toggle). The old global "default model" setting is gone. **Vertex**: framework only (server-side
  service-account JSON via `GOOGLE_VERTEX_CREDENTIALS`; client sends project/region/model).
  **Auto-title** uses a configurable connection/model + prompt.
- **Round 8 tweaks** (user request, 2026-05-28): in sidebar select mode there's no global
  "select all"; clicking a **preset** toggles selection of all its chats (preset row shows a
  check/partial box). The combined settings dialog no longer has a **Name** field (rename only via
  the sidebar's inline Rename), and the sidebar no longer repeats **Preset settings** (it lives in
  the chat header gear).
- **Round 7 tweaks** (user request, 2026-05-28): clicking a **preset** activates it and jumps to its
  top chat (chevron still toggles collapse); the top-level **New chat** targets the **active preset**.
  Preset settings moved into the chat header's gear, **combined** with the chat's own system prompt
  (one dialog). Removed the redundant per-preset "New chat" menu item and the sidebar's bottom
  Settings button (the header Settings remains).
- **Round 6 tweaks** (user request, 2026-05-28): sidebar **chat multi-select** (toggle in the sidebar
  header) with select/deselect-all and bulk **delete** / **move to preset**. The Connections **Test**
  lets you pick which saved model to test.
- **Round 5 tweaks** (user request, 2026-05-28): Vertex `global` location uses host
  `aiplatform.googleapis.com` (regions stay `{region}-aiplatform…`). New connections start with **no
  models** (detect/add to populate). A chat can be **moved between presets** from its sidebar menu
  ("Move to preset"). The Connections page has a **Test** button that sends a tiny message via the
  first model and reports ok+latency or the error.
- **Round 4 tweaks** (user request, 2026-05-28): the OpenAI-style connection type is labelled
  **"Custom"** (it's a flexible base-URL/key upstream); **Vertex** creds now live on the connection
  (project, region, client_email, private_key — or upload the service-account JSON to parse them) and
  are sent to the proxy to mint the token (server `GOOGLE_VERTEX_CREDENTIALS` remains a fallback). The
  composer has an **expand button** (textarea grows to ~half the viewport). **Quick prompts** moved to
  a dedicated master-detail dialog (scrollable list + large editor) for many/long prompts. The chat
  header no longer has a **preset selector** — move a chat between presets in the sidebar.
- **Backup & restore** (user request, 2026-05-28): a full DB dump (config, chats/history,
  connections incl. keys, prompts, attachments as base64) to a portable JSON. **Export/import** a
  file client-side; **back up to the server's local disk** (`POST /api/backup`, listed/restored/
  deleted via the proxy; dir = `RELAY_BACKUP_DIR`, default `./backups`, gitignored) so it survives a
  cleared browser and works on a VPS. **Scheduled** backups run client-side while the app is open
  (interval in `appConfig.backup`). Restore replaces the whole DB and reloads.
- **Connections round 3** (user request, 2026-05-28): **two connection types** — `openai`
  (OpenAI-compatible; covers OpenRouter/OpenAI/Groq/local and Gemini via its OpenAI endpoint) and
  `vertex` (the incompatible one). Native Gemini AI Studio is reached through the OpenAI-compatible
  Google endpoint (v5 migration converts old `gemini` connections). Connections are edited as a
  structured form (name/type/baseUrl/masked key; vertex: project/region). **No default connection** —
  each has an **On/Off** toggle and every On connection's models appear together (grouped) in the
  preset/header model picker. **Select/unselect all** in the branch map and the detect picker.
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
- **Public deployment — tried then reverted** (user decision, 2026-05-29): a VPS deploy (Oracle
  Ampere + Caddy auto-HTTPS + env-gated HTTP Basic auth, served from the Hono server) was built,
  verified live, then torn down — requiring a server round-trip to *use* a local-first chat app is
  the wrong model. The VPS was restored to its pre-deploy state and the deploy kit removed from the
  repo. Relay stays **run-locally**; cross-device needs are met by **WebDAV sync** (M8). A public
  host is not planned; if ever revisited, the gate + single-origin Hono approach is the template.
- Confirm **Vertex** project/location/region and that a service-account JSON is available
  (Vertex provider is registered but not yet implemented).
- **WebDAV target** (M8) — the user's WebDAV server URL + credentials (Nextcloud / NAS / hosted /
  the VPS repurposed as a WebDAV host); needed to wire and test sync.

## 10. First Steps (when you open the new session)

1. Copy this `PLAN.md` into the new project folder.
2. Scaffold: `npm create vite@latest . -- --template react-ts`, add Tailwind + shadcn/ui + Dexie +
   Zustand + react-markdown stack + Hono.
3. Wire Vite dev `server.proxy` `/api` → Hono.
4. Build M0 layout, then proceed through milestones.
5. `git init`, create a **private** GitHub repo, push.
