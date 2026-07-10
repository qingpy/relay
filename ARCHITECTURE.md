# Relay: Architecture (as built)

The reference for changing Relay safely; running it is in README.md. Relay is
a light, browser-based, multi-provider LLM chat app, local-first: everything
works against one user-owned snapshot file on your disk; the network carries
only LLM calls and optional WebDAV sync; no account, no backend beyond a thin
stateless proxy. Few dependencies; prefer the platform (`fetch`,
`ReadableStream`, IndexedDB). The functional build is complete; ongoing work
is debugging, features, and upgrades.

## 1. Two pieces, one repo

Frontend SPA (React 19 + Vite + Tailwind; Dexie over an in-memory IndexedDB;
Zustand view state) calls the proxy over `/api/*`; the proxy forwards LLM
requests and streams SSE back, attaches auth, and owns the data file + WebDAV
I/O. Dev: Vite serves the SPA on `:5173` and proxies `/api` to Hono on
`:8787`. Production: the Hono server serves `dist/` and `/api` on one origin
(`:8787`), zero CORS. The proxy is required; it owns the data file.

## 2. Data model (Dexie / IndexedDB)

Types in `src/db/types.ts`; schema + migrations in `src/db/db.ts`; all CRUD in
`src/db/repo.ts`.

```
connections { id, name, type: 'openai'|'vertex', url?,        // url = full …/chat/completions
              models: SavedModel[] (id, label?, capabilities),
              project?, region?, clientEmail?,                // vertex (non-secret)
              enabled?, order, createdAt }
              // secrets (API key, Vertex private key) live in the proxy's secret store
folders     { id, name, parentId|null, order, createdAt,      // a "Preset" in the UI
              connectionId?, model?, settings?: ModelSettings, systemPrompt? }
sessions    { id, folderId (preset), title, systemPrompt?,
              currentLeafId?, deletedAt?,                      // deletedAt set = in the trash
              createdAt, updatedAt, order }
messages    { id, sessionId, parentId|null,                   // tree edge → branching
              role: 'user'|'assistant'|'system'|'divider',
              content: Part[], reasoning?, reasoningMs?, toolCalls?, citations?,
              attachments?: fileId[], model?, usage?, error?, createdAt }
files       { id, sessionId, messageId, name, mimeType, size, blob, hash?,
              removedAt?, stripped?,                          // bytes-less tombstone/placeholder
              createdAt }
prompts     { id, title, content, order }
appConfig   { id:'singleton', theme, exportIncludeThinking?,
              titleConnectionId?/titleModel?/titlePrompt?,    // auto-title
              reasoningEfforts?: string[],                    // global effort choices
              trashRetentionDays?,                            // auto-purge trash (default 10; 0 = off)
              backupIncludeFiles?,                            // attachments in backups/Export (default on)
              backup?, webdav? }                              // webdav.includeFiles = the WebDAV-side switch
```

Key ideas:

- Presets (stored as `folders`) fix connection / model / settings / system
  prompt for their chats; a chat adds only an extra system prompt.
- Branching: messages form a tree via `parentId`; the visible conversation is
  root → `session.currentLeafId`. Regenerate/fork create siblings; editing a
  user turn rewrites it in place (text and attachments). See `src/lib/tree.ts`.
- Context divider: a `role:'divider'` message; everything before the latest
  divider stays on screen but is excluded from the request (`activeWindow` in
  `src/lib/conversation.ts`).
- Trash: deleting a chat sets `deletedAt`; `listSessions()` hides those, the
  Trash dialog restores / deletes forever; `purgeExpiredTrash()` on boot
  hard-deletes past `trashRetentionDays`.
- Attachments are copied, content-addressed bytes: `saveAttachments` reads the
  picked `File` immediately into an owned Blob (a `File` is a lazy path
  reference; reading it later throws once the source moves). Identical content
  (SHA-256 `hash`) shares one Blob and one base64 copy in the snapshot's
  `data.blobs` pool.
- Bytes-less rows: `removedAt` (user removed it: "Removed" tag, a tombstone
  everywhere) and `stripped` (left out of a snapshot by an "Include
  attachments" switch: "Missing" tag, re-hydrated by hash wherever the bytes
  exist). Both append a removed-note to the model's view of that turn.
  Bytes-less rows never serve as dedupe sources or enter the blob pool.
- Migrations v1–v6 in `db.ts`.

## 3. Storage & sync: one snapshot, three layers

All three layers serialize the same `BackupFile` from `exportAll()`
(`src/lib/backup.ts`): the whole DB, attachments as base64 (each unique
content once in the hash-keyed `data.blobs` pool). `exportAll()` strips every
secret at this one chokepoint, so every snapshot is credential-free.
`importAll()` replaces the DB and re-hydrates `stripped` rows from the
snapshot's pool or from local bytes by hash; `removedAt` tombstones propagate
as-is.

Attachments are optional everywhere except the data file: server/file backups
and Export honor `appConfig.backupIncludeFiles`; the WebDAV mirror honors
`webdav.includeFiles` (both default on; off ships `stripped` placeholders and
omits the pool).

Secrets live in a proxy-owned store (`server/secrets.ts`;
`RELAY_SECRETS_FILE`, default a per-user config dir outside the repo), keyed
by connection id. The browser sends keys write-only and reads booleans
(`src/lib/secrets.ts`); `migrateEmbeddedSecrets()` lifts keys out of older
snapshots on boot.

1. **Local data store (source of truth).** Dexie runs on an in-memory
   IndexedDB (`fake-indexeddb`, `USE_LOCAL_STORE` in `db.ts`); the durable
   copy is one JSON file owned by the proxy through `server/data.ts` (§5).
   `src/lib/localstore.ts`: boot `GET` → `importAll`; on any change write the
   snapshot back, ~400 ms debounced, flush on tab-hide/`beforeunload`, retry
   on its own clock. One-time migration from the pre-M9 persistent IndexedDB
   (needs `indexedDB.databases()`, Chromium/Edge). Boot gating in `App.tsx`:
   no render until loaded; a "start the proxy" screen if `/api/data` is
   unreachable.
2. **WebDAV sync (cross-device).** `src/lib/webdav.ts` through
   `server/sync.ts` (stateless GET/PUT/PROPFIND/DELETE/MKCOL forwarder;
   `x-webdav-url` + `x-webdav-user` per request, password from the secret
   store, or transient `x-webdav-pass` for Test). Last-write-wins, but no
   automatic sync overwrites real data: the cloud is auto-adopted only onto a
   pristine device, a blank remote never clobbers content, a pristine device
   never seeds a blank snapshot; anything ambiguous pauses as a visible
   conflict, resolved in Settings → Sync (Keep this device / Keep server).
   Pull on open, scheduled push (interval in hours), flush on hide. The sync
   cursor (`rev`, `lastSyncAt`) lives in the proxy's `.sync` sidecar so every
   browser on the machine shares it; first run seeds from the legacy
   localStorage cursor. Versioned backups: millisecond-stamped copies in a
   `backups/` subfolder, one per interval plus each manual Backup, pruned to
   `backupsKeep` (default 10; 0 disables).
3. **Backups (portable).** `src/lib/backupClient.ts` + `server/backup.ts`
   write timestamped snapshots to `RELAY_BACKUP_DIR`, plus file
   download/import and scheduled backups. Restore replaces the DB and reloads.

## 4. Providers

Interface in `src/providers/types.ts`, chosen by `registry.ts`:

```ts
interface Provider {
  type: ConnectionType;
  buildRequest(input): { url; headers; body };  // url = a proxy path, e.g. /api/chat/openai
  parseStreamChunk(data): Delta[];               // text | reasoning | toolCall(Delta) | citation | usage | error
}
```

- `OpenAICompatProvider` (`openai.ts`): OpenAI, OpenRouter, Groq, local
  servers, and Gemini AI Studio via its OpenAI-compatible endpoint. OpenRouter
  additionally gets the web plugin + `reasoning.effort`.
- `VertexProvider` (`vertex.ts`; Gemini request body shared in `gemini.ts`):
  the proxy mints the OAuth token.

The client builds the full payload and POSTs to the proxy:

- `POST /api/chat/openai` `{url, payload, connectionId}`: key resolved from
  the secret store by `connectionId` (or transient `x-api-key` when testing,
  or `OPENROUTER_KEY`/`OPENAI_KEY` env). `url` is the connection's full
  user-editable endpoint, protocol-checked and called verbatim;
  `/api/models/openai` derives the `…/models` URL from it.
- `POST /api/chat/vertex` `{project, region, model, payload, connectionId,
  clientEmail}`: the proxy mints a token (`server/vertex-auth.ts`) and calls
  `…:streamGenerateContent?alt=sse`. The private key comes from the secret
  store (or a transient one when testing, or `GOOGLE_VERTEX_CREDENTIALS*`).

The proxy streams upstream SSE straight back; `src/lib/sse.ts` parses it and
`store/chat.ts` turns deltas into persisted streaming buffers.

Capabilities: each saved model carries `{vision, pdf, reasoning, webSearch,
toolUse}` (inferred in `models.ts`, user-editable), gating composer
attachments and preset knobs. Reasoning effort comes from one global
user-editable list (`appConfig.reasoningEfforts`); OpenAI-style sends
`reasoning_effort`, Gemini `thinkingConfig.thinkingLevel`.
`sanitizeSettings()` strips knobs the model lacks at the resolve boundary.

Config resolution: `src/lib/resolve.ts` (live via `useResolved.ts`) turns
session + preset + connections into the effective `{connection, model,
settings, capabilities}`: preset knobs, preset + chat system prompts
concatenated, falling back to the first enabled connection (and its first
model when the preset's model is orphaned).

## 5. Proxy endpoints (`server/`)

```
GET  /api/health
POST /api/chat/openai        # OpenAI-compatible passthrough (SSE)
POST /api/chat/vertex        # Vertex: mint token, passthrough (SSE)
GET  /api/models/:provider   # optional model-list proxy
GET  /api/data               # local data store: read snapshot
PUT  /api/data               # local data store: atomic write
GET  /api/data/info          # data file path/size/savedAt
GET/PUT /api/data/sync-state # durable WebDAV sync cursor
GET/PUT/DELETE /api/sync     # WebDAV forwarder: live snapshot + versioned backups
POST /api/sync/list          # WebDAV PROPFIND (enumerate backups), raw XML to the client
POST /api/sync/test          # WebDAV PROPFIND credential check
GET/POST/DELETE /api/backup  # on-disk backups (list/write/read/delete)
GET  /api/secrets/status     # which connection ids / WebDAV have a secret (booleans only)
PUT/DELETE /api/secrets/connection/:id   # set/clear a connection's key
PUT  /api/secrets/webdav     # set/clear the WebDAV password
```

`server/index.ts` mounts these under `/api` and, in production, serves `dist/`
with an SPA fallback. No state, no DB; shared helpers (JSON responses, URL
check, retry, serialized atomic writes) in `server/util.ts`. Upstream URLs are
user config, used verbatim after an http(s)-protocol check, acceptable because
the proxy is local-only with no auth (§7).

## 6. Frontend layout (`src/`)

```
main.tsx              React root (StrictMode)
App.tsx               boot gating (load store → seed → WebDAV); top-level layout
index.css             design tokens: the flat "Unboxed Stationery" theme + label-mono
db/        types.ts · db.ts (Dexie, in-memory backend, migrations) · repo.ts (all CRUD)
store/     ui.ts (view state) · chat.ts (streaming engine: send/regenerate/stop;
           the assistant turn is created before any fallible work so failures
           surface on it; a 120 s idle watchdog aborts hung streams; regenerate
           stops an in-flight stream first; zero-output turns are spliced on
           stop or errored on completion)
providers/ types.ts · registry.ts · openai.ts · gemini.ts · vertex.ts
lib/       resolve.ts/useResolved.ts · models.ts · conversation.ts · tree.ts ·
           context.ts · backup.ts · localstore.ts · webdav.ts · backupClient.ts ·
           secrets.ts · attachments.ts · sse.ts · detect.ts · connTest.ts ·
           autotitle.ts · export.ts · session-actions.ts · time.ts · utils.ts ·
           useObjectUrl.ts
components/
  layout/   ChatPane · Sidebar · KeyboardShortcuts
  chat/     MessageList · MessageItem · Composer · Reasoning · ToolCard · Citations ·
            TreeMap · SiblingSwitcher · ContextMeter · SessionControls · PresetControls ·
            ModelSelect · ExportMenu · SlashPalette · MessageActions · SelectionToolbar
  sidebar/  SessionTree · FolderRow (preset) · SessionRow · PresetEditor ·
            InlineEdit · ChatSelectionBar · TrashDialog
  settings/ SettingsDialog · ConnectionsManager · ModelPicker · PromptsManager ·
            AutoTitleSettings · DataStoreSettings · WebdavSettings · BackupSettings ·
            SectionLabel
  ui/       shadcn/Radix primitives + flat-* (dialog, popover, dropdown-menu, switch,
            slider, flat-select, flat-button, marginalia, check-square, confirm, input)
```

Active target: the header/composer act on the open chat; with none but a
preset selected they fall back to a blank chat bound to that preset, and the
first send starts a real chat there. Presets are configured from the header
(Tune); a preset row menu is just Rename/Delete; deleting the open chat
advances to the preset's next chat.

Design system "Unboxed Stationery", light only: airy grey canvas, hairline
borders, no shadows or rounded corners, one slate-blue accent,
uppercase-monospace labels. All re-skin flows through tokens in
`src/index.css`. Shared primitives: `Marginalia`, `CheckSquare`,
`SectionLabel`, the `flat-*` components. Fonts: Inter / JetBrains Mono, with
bundled, unicode-range-subsetted Noto Sans SC for CJK (self-hosted, no
external font requests).

## 7. Key decisions

- Name Relay; light only; default model OpenRouter `openai/gpt-4o-mini`.
- Two protocols only: `openai` (OpenAI-compatible, covers most incl. Gemini
  AI Studio) and `vertex`.
- Reasoning effort from a global user-editable list (seeded
  minimal/low/medium/high); Temp / Top-P explicit on/off (off = provider
  default, knob omitted).
- Stay run-locally: a public VPS deployment was built then reverted;
  cross-device needs are met by WebDAV sync.
- Distribution is a local Docker image (`Dockerfile` → GHCR via
  `.github/workflows/docker.yml`; esbuild-bundled proxy, no `node_modules`;
  all state in one `/data` volume). Self-hosting only: the proxy has no auth.

## 8. Caveats

- The whole DB lives in RAM; a very large attachment library would push toward
  a server-side SQLite rewrite (`repo.ts` changes, the rest doesn't).
- A hard crash can lose the last unsynced change (~400 ms debounce +
  hide/unload flush).
- Two same-origin tabs are last-write-wins; the WebDAV sync cursor is shared
  machine-wide via the proxy sidecar.
- Secrets exist only in the proxy store, plaintext on disk: protection against
  accidental exposure and propagation, not against a process running as you.
  `exportAll()` strips them from every snapshot. Backups written before this
  design may still hold keys: rotate or delete them.
- Scheduled work (backups, WebDAV) runs only while a tab is open.
- The pre-M9 migration needs `indexedDB.databases()` (Chromium/Edge); other
  browsers start fresh from the file.

## 9. Environment variables (all optional)

| Var | Purpose | Default |
|---|---|---|
| `RELAY_DATA_FILE` | Path to the data snapshot | `./data/relay.json` |
| `RELAY_SECRETS_FILE` | Secret store (API keys, Vertex key, WebDAV password) | per-user config dir (`%APPDATA%\Relay\secrets.json` / `~/.config/relay/secrets.json`) |
| `API_PORT` | Proxy port | `8787` |
| `RELAY_BACKUP_DIR` | Folder for on-disk backups | `./backups` |
| `OPENROUTER_KEY` / `OPENAI_KEY` | Fallback key for OpenAI-style connections | - |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` | Fallback Vertex service account | - |
