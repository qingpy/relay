# Relay — Architecture (as built)

How Relay is put together, end to end. This is the reference for changing it
safely; for running it, see **`README.md`**.

Relay is a light, browser-based, multi-provider LLM chat app for personal use.
It is **local-first**: everything works against your own data on your own disk;
the network is only for LLM calls and optional WebDAV sync. The functional build
(streaming chat, branching, presets, connections, export, local data store,
WebDAV sync) is complete; ongoing work is debugging, new features, and upgrades.

---

## 1. Principles

- **Local-first.** Your data lives in one file on disk that you own; no account,
  no required server beyond a thin local proxy.
- **Thin proxy.** The only backend is a stateless request forwarder (Hono). No
  database, no auth. It attaches provider credentials, mints Vertex tokens, and
  forwards WebDAV/data-file I/O.
- **Provider-agnostic core.** A small `Provider` interface so adding a provider
  is one file, not edits across ten.
- **Light footprint.** Prefer the platform (`fetch`, `ReadableStream`,
  IndexedDB) over libraries; few dependencies.

---

## 2. Two pieces, one repo

```
┌──────────────────────────────┐          ┌─────────────────────────────┐
│  Frontend SPA (static)       │  /api/*  │  Proxy (Hono, stateless)    │
│  React 19 + Vite + Tailwind  │ ───────▶ │  - forwards LLM requests    │
│  Dexie over in-memory IDB    │          │  - attaches provider auth   │
│  Zustand view state          │ ◀─────── │  - mints Vertex OAuth token │
│                              │ streamed │  - reads/writes the data    │
│                              │  SSE     │    file + WebDAV snapshot   │
└──────────────────────────────┘          └─────────────────────────────┘
```

In dev (`npm run dev`) Vite serves the SPA on `:5173` and proxies `/api` to the
Hono server on `:8787`. In production (`npm run build && npm run serve`) the Hono
server serves the built SPA from `dist/` **and** `/api` on one origin (`:8787`),
so there is zero CORS. The proxy is **required** — it owns the data file.

---

## 3. Data model (Dexie / IndexedDB)

Types live in `src/db/types.ts`; the schema + migrations in `src/db/db.ts`; all
reads/writes in `src/db/repo.ts`.

```
connections { id, name, type: 'openai'|'vertex', url?,        // url = full …/chat/completions
              models: SavedModel[] (id, label?, capabilities),
              project?, region?, clientEmail?,                // vertex (non-secret)
              enabled?, order, createdAt }
              // secrets (API key, Vertex private key) live in the proxy's secret store, not here
folders     { id, name, parentId|null, order, createdAt,      // a "Preset" in the UI
              connectionId?, model?, settings?: ModelSettings, systemPrompt? }
sessions    { id, folderId (preset), title, systemPrompt?, webSearch?,
              currentLeafId?, deletedAt?,                      // deletedAt set = in the trash
              createdAt, updatedAt, order }
messages    { id, sessionId, parentId|null,                   // tree edge → branching
              role: 'user'|'assistant'|'system'|'divider',
              content: Part[], reasoning?, reasoningMs?, toolCalls?, citations?,
              attachments?: fileId[], model?, usage?, error?, createdAt }
files       { id, sessionId, messageId, name, mimeType, size, blob, createdAt }
prompts     { id, title, content, order }
appConfig   { id:'singleton', theme, exportIncludeThinking?,
              titleConnectionId?/titleModel?/titlePrompt?,    // auto-title
              reasoningEfforts?: string[],                    // global effort choices
              trashRetentionDays?,                            // auto-purge trash (default 10; 0 = off)
              backup?, webdav? }
```

Key ideas:
- **Connections** are user-defined upstreams (a name + protocol + URL + a
  saved model catalog with per-model capabilities); their secrets live in the
  proxy's secret store (§4), keyed by connection id, never in the record.
  **Presets** (stored as
  `folders`) fix the connection/model/settings/system-prompt for the chats inside
  them; a chat adds only an extra system prompt + a web-search toggle.
- **Branching.** Messages form a *tree* via `parentId`; the visible conversation
  is the path root → `session.currentLeafId`. Regenerate / edit / fork create
  siblings (non-destructive). See `src/lib/tree.ts` (`activePath`, `leafOf`,
  `childrenOf`, `siblingsOf`).
- **Context divider.** A `role:'divider'` message; everything before the *latest*
  divider stays on screen but is excluded from what's sent (`activeWindow` in
  `src/lib/conversation.ts`). "Clear context without clearing the page."
- **Trash (soft delete).** Deleting a chat sets `session.deletedAt` instead of
  removing it; `listSessions()` hides those, `listTrashedSessions()` surfaces them
  in the Trash dialog (restore / delete-forever / empty). `purgeExpiredTrash()`
  runs on boot and hard-deletes anything older than `appConfig.trashRetentionDays`
  (default 10; `0` keeps them until emptied). `purgeSession()` is the hard delete.
- **Migrations** v1–v5 in `db.ts` (message tree backfill; provider keys →
  connections; presets-only; collapse types to `openai|vertex`).

---

## 4. Storage & sync — one snapshot, three layers

All three serialize the **same payload**: the `BackupFile` from
`exportAll()` in `src/lib/backup.ts` — the whole DB (connections, folders,
sessions, messages, prompts, appConfig, and attachments as base64). `exportAll()`
**strips every secret** (API keys, the Vertex private key, the WebDAV password)
at this one chokepoint, so the snapshot is always credential-free — on disk, on
WebDAV, and in every backup. `importAll()` replaces the DB from one. Both take an
optional DB arg (used by the M9 migration to read the old persistent store).

Secrets instead live in a **separate proxy-owned store** (`server/secrets.ts`),
keyed by connection id, in a file outside the repo (env `RELAY_SECRETS_FILE`,
default a per-user config dir). The browser never holds raw keys after boot: it
sends only a `connectionId` and the proxy injects the credential when forwarding
(see §5). The client mirror is `src/lib/secrets.ts` — write-only setters, a
booleans-only status read for the "saved" placeholders, and a one-time
`migrateEmbeddedSecrets()` on boot that lifts any keys still embedded in an older
snapshot into the store and rewrites the file clean.

1. **Local data store (the source of truth).** The browser backs Dexie with an
   **in-memory IndexedDB** (`fake-indexeddb`, selected by `USE_LOCAL_STORE` in
   `db.ts`) — so `repo.ts`/`useLiveQuery`/components are unchanged but nothing
   persists to the browser profile / C:. The durable copy is a single JSON file
   owned by the proxy:
   - **`server/data.ts`** → `GET /api/data` (the `{rev,savedAt,data}` snapshot,
     or `{rev:0}`), `PUT /api/data` (atomic temp-file + rename), `GET
     /api/data/info` (`{path,size,savedAt}`).
   - **`src/lib/localstore.ts`** → on boot, `GET` → `importAll` into the in-memory
     DB; on any change (Dexie hooks, suppressed during import) write the whole
     snapshot back, ~400 ms debounced, plus a flush on tab-hide/`beforeunload`.
   - **Migration (one-time).** If the data file is empty and a *persistent* `relay`
     IndexedDB still exists (pre-M9), it's exported to the file, then
     `deleteDatabase('relay')` frees C:. Needs `indexedDB.databases()`
     (Chromium/Edge); other browsers just start fresh from the file.
   - **Boot gating** in `App.tsx`: the app doesn't render until the load
     completes, and shows a "start the proxy" screen if `/api/data` is
     unreachable.
   - Path: env `RELAY_DATA_FILE` (default `./data/relay.json`), shown read-only in
     Settings → Sync (`DataStoreSettings`).

2. **WebDAV sync (off-machine / cross-device).** `src/lib/webdav.ts` mirrors the
   same snapshot to the user's WebDAV server through **`server/sync.ts`** (a
   stateless GET/PUT/PROPFIND/DELETE/MKCOL forwarder; `x-webdav-url` +
   `x-webdav-user` per request, with the password supplied from the secret store
   — or a transient `x-webdav-pass` for the Settings "Test"). Last-write-wins for
   a single user, but **no automatic sync overwrites real local data**: the cloud
   is auto-adopted only onto a pristine device, an empty/blank remote never
   clobbers a device with content, and a pristine device never seeds a blank
   snapshot — anything ambiguous pauses with a visible conflict. A paused
   conflict (both sides hold data and this origin's `rev` is still 0) is resolved
   explicitly in Settings → Sync: **Keep this device** (`resolveKeepLocal` — push
   local over the server) or **Keep server** (`resolveKeepServer` — pull and
   replace local), or by restoring a backup. Pull on open, scheduled push while
   open (interval in **hours**), flush on hide.
   - **Versioned backups.** Alongside the single live snapshot, Relay keeps a
     rolling set of timestamped copies in a `backups/` subfolder — one written
     every `intervalHours`, plus one on each manual **Backup**, pruned to the
     newest `backupsKeep` (default 10; `0` disables). Each is a normal
     (secret-free) snapshot; any one is restorable from the **Restore** list.
     The Settings panel is just **Test · Backup · Restore**. Settings → Sync.

3. **Backups (portable copies).** `src/lib/backupClient.ts` + **`server/backup.ts`**
   write timestamped snapshots to `RELAY_BACKUP_DIR` (`/api/backup`), plus
   file download/import and scheduled backups. Restore replaces the DB and reloads.

---

## 5. Providers

Interface in `src/providers/types.ts`; chosen by `registry.ts`:

```ts
interface Provider {
  type: ConnectionType;
  buildRequest(input): { url; headers; body };  // url = a proxy path, e.g. /api/chat/openai
  parseStreamChunk(data): Delta[];               // text | reasoning | toolCall(Delta) | citation | usage | error
}
```

- **`OpenAICompatProvider`** (`openai.ts`) — OpenAI, **OpenRouter**, Groq, local
  servers, and **Gemini AI Studio via its OpenAI-compatible endpoint**
  (`…/v1beta/openai`). Differs from plain OpenAI only by base URL (OpenRouter gets
  the web plugin + `reasoning.effort`). There is no separate Gemini provider/route.
- **`VertexProvider`** (`vertex.ts`, shares the Gemini request body in
  `gemini.ts`) — Gemini `generateContent` body; the proxy mints the OAuth token.

The client builds the full payload and POSTs to the proxy:
- `POST /api/chat/openai` — body `{ url, payload, connectionId }`. The proxy
  resolves the API key from the secret store by `connectionId` (or a transient
  `x-api-key` header when testing an unsaved key, or `OPENROUTER_KEY`/`OPENAI_KEY`
  env). `url` is the connection's full, user-editable endpoint; the proxy
  validates the protocol and calls it verbatim. Model detection
  (`/api/models/openai`) derives the `…/models` URL from it.
- `POST /api/chat/vertex` — body `{ project, region, model, payload, connectionId,
  clientEmail }`. Proxy mints a token (`server/vertex-auth.ts`) and calls
  `…:streamGenerateContent?alt=sse`. The service-account **private key** comes
  from the secret store by `connectionId` (or a transient one in the body when
  testing, or `GOOGLE_VERTEX_CREDENTIALS*` env); it never reaches the browser.

The proxy streams the upstream SSE straight back; `src/lib/sse.ts` parses it and
`store/chat.ts` turns deltas into the streaming buffers it persists.

**Capabilities & reasoning.** Each saved model carries `{vision, pdf, reasoning,
webSearch, toolUse}` (inferred in `models.ts`, user-editable in Connections), used
to gate the composer and the reasoning control. `reasoningKind(caps)` → `none`
(no knob) / `effort` (a string chosen from the global `appConfig.reasoningEfforts`
list). Every reasoning-capable model uses the same effort knob — OpenAI-compatible
endpoints send it as `reasoning_effort`, Vertex/Gemini as `thinkingConfig.thinkingLevel`.
`sanitizeReasoning()` strips it at the resolve boundary when the model can't reason,
so a stale value is never sent.

**Config resolution.** `src/lib/resolve.ts` (`resolveConfig`, live via
`useResolved.ts`) turns a session + its preset + connections into the effective
`{connection, model, settings, capabilities}`: preset's connection/model/knobs,
the preset's system prompt + the chat's own concatenated, the chat's web-search
toggle, with sane fallbacks.

---

## 6. Proxy endpoints (`server/`)

```
GET  /api/health
POST /api/chat/openai        # OpenAI-compatible passthrough (SSE)
POST /api/chat/vertex        # Vertex: mint token, passthrough (SSE)
GET  /api/models/:provider   # optional model-list proxy
GET  /api/data               # local data store: read snapshot
PUT  /api/data               # local data store: atomic write
GET  /api/data/info          # data file path/size/savedAt
GET/PUT/DELETE /api/sync     # WebDAV forwarder: live snapshot + versioned backups
POST /api/sync/list          # WebDAV PROPFIND (enumerate backups), raw XML to the client
POST /api/sync/test          # WebDAV PROPFIND credential check
GET/POST/DELETE /api/backup  # on-disk backups (list/write/read/delete)
GET  /api/secrets/status         # which connection ids / WebDAV have a secret (booleans only)
PUT/DELETE /api/secrets/connection/:id   # set/clear a connection's API key or Vertex private key
PUT  /api/secrets/webdav         # set/clear the WebDAV password
```

`server/index.ts` mounts these under `/api` and, in production, serves `dist/`
with an SPA fallback. No state, no DB; endpoints validate upstream URLs so the
proxy can't become an open forwarder.

---

## 7. Frontend layout (`src/`)

```
main.tsx              React root (StrictMode)
App.tsx               boot gating (load store → seed → WebDAV); top-level layout
index.css             design tokens — the flat "Unboxed Stationery" theme + label-mono
db/        types.ts · db.ts (Dexie, in-memory backend, migrations) · repo.ts (all CRUD)
store/     ui.ts (view state) · chat.ts (streaming engine: send/regenerate/stop)
providers/ types.ts · registry.ts · openai.ts · gemini.ts · vertex.ts
lib/       resolve.ts/useResolved.ts · models.ts · conversation.ts · tree.ts ·
           context.ts (header meter) · backup.ts · localstore.ts · webdav.ts ·
           backupClient.ts · secrets.ts (secret-store client) · attachments.ts ·
           sse.ts · detect.ts · connTest.ts · autotitle.ts · export.ts ·
           session-actions.ts · time.ts · utils.ts
components/
  layout/   ChatPane · Sidebar · KeyboardShortcuts
  chat/     MessageList · MessageItem · Composer · Reasoning · ToolCard · Citations ·
            TreeMap · SiblingSwitcher · ContextMeter · SessionControls · ModelSelect ·
            ExportMenu · SlashPalette · MessageActions · SelectionToolbar
  sidebar/  SessionTree · FolderRow (preset) · SessionRow · PresetEditor
            ("Model & instructions") · InlineEdit · ChatSelectionBar · TrashDialog
  settings/ SettingsDialog · ConnectionsManager · ModelPicker · PromptsManager ·
            AutoTitleSettings · DataStoreSettings · WebdavSettings · BackupSettings ·
            SectionLabel
  ui/       shadcn/Radix primitives + flat-* (dialog, popover, dropdown-menu, switch,
            slider, flat-select, flat-button, marginalia, check-square, confirm, input)
```

**Design system.** Strictly-flat "Unboxed Stationery": airy grey canvas, hairline
borders, **no shadows or rounded corners**, one slate-blue accent,
uppercase-monospace labels/metadata, **light-only**. All re-skin flows through
tokens in `src/index.css` (`--radius: 0`, neutralized shadows, the `label-mono`
utility). Shared primitives avoid repetition: `Marginalia` (mono text actions),
`CheckSquare` (one selection box), `SectionLabel` (settings headings).

---

## 8. Key decisions (resolved)

- **Name:** Relay. **Theme:** light only. **Default model:** OpenRouter
  `openai/gpt-4o-mini`.
- **Connections + presets** (not fixed providers): multiple connections per
  protocol with a saved, capability-tagged model catalog; presets fix
  model/settings/system-prompt for their chats. Two protocols only — `openai`
  (OpenAI-compatible, covers most incl. Gemini AI Studio) and `vertex`.
- **Reasoning effort** is chosen from a **global, user-editable list**
  (`appConfig.reasoningEfforts`, seeded `minimal/low/medium/high`, managed inline
  in "Model & instructions"), gated by capability and split by protocol. Temp /
  Top-P are explicit on/off (off = provider default, knob omitted).
- **Local data store off the browser (option 3)** — the in-memory-IDB + snapshot
  file design in §4. Chosen so the whole dataset stays usable as a normal browser
  tab, lives off C: at a path the user controls, and is the same artifact WebDAV
  backs up.
- **Stay run-locally.** A public VPS deployment was built then **reverted** —
  needing a server round-trip just to open a local-first chat app is the wrong
  model. Cross-device needs are met by WebDAV sync. If a public host is ever
  revisited, the template is a single-origin Hono server behind a gate.
- **Distribution = a local Docker image.** For others to run Relay without the
  repo, the build is shipped as a multi-arch image (`Dockerfile` → GHCR via
  `.github/workflows/docker.yml`). The proxy is bundled to one JS file
  (`npm run build:server`, esbuild), so the runtime image is Node + `dist/` +
  that bundle, with **no `node_modules`**. All state lives in one `/data` volume
  (`RELAY_DATA_FILE`/`RELAY_SECRETS_FILE`/`RELAY_BACKUP_DIR` point there). Still
  local-only — the proxy has no auth, so the image is for self-hosting on your
  own machine, not a public host.

---

## 9. Caveats / gotchas

- **The proxy must be running** to load or save data (no offline-without-server).
  Boot shows a clear error if `/api/data` is unreachable.
- **Whole DB lives in RAM** (in-memory IDB). Fine for typical use; a very large
  attachment library is the limit that would push toward a server-side SQLite
  rewrite (deferred — `repo.ts` would change, the rest wouldn't).
- **Durability:** the last unsynced change can be lost on a hard crash —
  mitigated by the ~400 ms debounce + hide/unload flush.
- **Two tabs of the same origin are last-write-wins** (local file and WebDAV).
- **Secrets:** API keys, the Vertex private key, and the WebDAV password live
  **only** in the proxy's secret store (`RELAY_SECRETS_FILE`, default a per-user
  config dir **outside the repo**), keyed by connection id. `exportAll()` strips
  them, so the data file / backups / WebDAV snapshot are credential-free, and the
  browser never persists them — which keeps them out of an agent's working tree.
  The store is plaintext on disk: it protects against accidental exposure and
  propagation, not against a process running as you (use OS file perms / disk
  encryption for that). The proxy has **no auth** — fine for local use; do not
  expose it publicly without a gate. **Old** backups / WebDAV snapshots written
  before this change may still contain keys — rotate or delete them.
- **Scheduled work (backups, WebDAV) runs only while a tab is open.**
- **Migration from the old persistent store** needs `indexedDB.databases()`
  (Chromium/Edge). On browsers without it, the old store isn't auto-removed; the
  app still starts fresh from the file.

---

## 10. Environment variables (all optional)

| Var | Purpose | Default |
|---|---|---|
| `RELAY_DATA_FILE` | Path to the data snapshot | `./data/relay.json` |
| `RELAY_SECRETS_FILE` | Path to the secret store (API keys, Vertex key, WebDAV password) | per-user config dir (`%APPDATA%\Relay\secrets.json` / `~/.config/relay/secrets.json`) |
| `API_PORT` | Proxy port | `8787` |
| `RELAY_BACKUP_DIR` | Folder for on-disk backups | `./backups` |
| `OPENROUTER_KEY` / `OPENAI_KEY` | Fallback key for OpenAI-style connections + model listing | — |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` | Fallback Vertex service-account | — |
