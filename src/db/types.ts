/**
 * Domain model for Relay. Mirrors ARCHITECTURE.md §3 (Data model).
 *
 * IDs are app-generated strings (crypto.randomUUID) so records can be created
 * offline and synced without a server assigning keys.
 */

/**
 * Wire protocol a connection speaks. Nearly everything (OpenAI, OpenRouter,
 * Groq, DeepSeek, local, even Gemini's OpenAI-compatible endpoint) is `openai`;
 * `vertex` is the one incompatible upstream (Gemini body + service-account auth).
 */
export type ConnectionType = 'openai' | 'vertex';

export type MessageRole = 'user' | 'assistant' | 'system' | 'divider';

/** A piece of message content. Text is inline; binary lives in `files`. */
export type Part =
  | { type: 'text'; text: string }
  | { type: 'image'; fileId: string }
  | { type: 'file'; fileId: string };

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  /** True while the result is still streaming/pending. */
  pending?: boolean;
}

export interface Citation {
  url: string;
  title?: string;
  /** Optional excerpt/snippet shown in the citation card. */
  snippet?: string;
  /** Character range in the answer this citation supports, if provided. */
  start?: number;
  end?: number;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Reasoning tokens, when the provider reports them separately. */
  reasoningTokens?: number;
}

/** What a model can do. Saved per model and used to gate the composer UI. */
export interface ModelCapabilities {
  vision: boolean;
  pdf: boolean;
  reasoning: boolean;
  webSearch: boolean;
  toolUse: boolean;
}

/** A model saved in a connection's catalog. */
export interface SavedModel {
  id: string;
  label?: string;
  capabilities: ModelCapabilities;
  /** Max context window in tokens. When set, the context meter reports usage as
   *  a percentage of this; when unset, it shows the absolute token estimate. */
  contextWindow?: number;
}

/**
 * A user-defined upstream: a name, a protocol, non-secret config, and a saved
 * model catalog. Multiple connections may share a protocol (e.g. two
 * OpenAI-compatible endpoints).
 *
 * Secrets are NOT stored here: the API key (OpenAI-compatible) and the Vertex
 * service-account private key live in the proxy's secret store, keyed by this
 * connection's `id` (see `server/secrets.ts` / `src/lib/secrets.ts`), so they
 * never enter the data snapshot, WebDAV mirror, backups, or the browser.
 */
export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  /** Full endpoint URL for OpenAI-compatible connections, e.g.
   *  `https://openrouter.ai/api/v1/chat/completions`. Every part is editable. */
  url?: string;
  models: SavedModel[];
  /** Vertex project id. */
  project?: string;
  /** Vertex region, e.g. `us-central1`. */
  region?: string;
  /** Vertex service-account email (non-secret; from the SA JSON). The matching
   *  private key lives in the secret store. */
  clientEmail?: string;
  /** When false, the connection's models are hidden from pickers. */
  enabled?: boolean;
  order: number;
  createdAt: number;
}

/** Model knobs shared by a preset (the system prompt and web search live
 *  elsewhere — on the preset and the chat respectively). */
export interface ModelSettings {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /**
   * Reasoning effort. Free text, because the accepted set varies by model and
   * protocol — OpenAI-compatible models take it as `reasoning_effort`,
   * Vertex/Gemini as `thinkingLevel` (e.g. `low` / `medium` / `high`). The user
   * types what their model accepts.
   */
  reasoningEffort?: string;
}

/** The full settings object handed to a provider's `buildRequest`. */
export interface ProviderSettings extends ModelSettings {
  systemPrompt?: string;
  webSearch?: boolean;
}

/**
 * A "Preset" in the UI: a container of chats that also fixes the model,
 * settings, and a shared system prompt for everything inside it. (Stored as
 * `folders` for migration continuity.)
 */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  /** Connection whose model this preset uses. */
  connectionId?: string | null;
  /** Model id (from the connection's catalog) for chats in this preset. */
  model?: string;
  /** Shared model knobs. */
  settings?: ModelSettings;
  /** Shared system prompt, prepended to each chat's own. */
  systemPrompt?: string;
}

export interface Session {
  id: string;
  /** Preset this chat belongs to (null = loose, uses the default connection). */
  folderId: string | null;
  title: string;
  /** Per-chat system prompt, appended to the preset's. */
  systemPrompt?: string;
  /** Per-chat web-search toggle. */
  webSearch?: boolean;
  /** Active branch tip — the conversation shown is root → this leaf. */
  currentLeafId?: string;
  /** When set, the chat is in the trash (hidden from the sidebar, restorable).
   *  Auto-purged once older than `AppConfig.trashRetentionDays`. */
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface Message {
  id: string;
  sessionId: string;
  /** Parent message in the session tree (null = root). Enables branching. */
  parentId: string | null;
  role: MessageRole;
  content: Part[];
  /** Foldable "thinking" / reasoning text. */
  reasoning?: string;
  /** Wall-clock time spent reasoning before the answer began (ms). */
  reasoningMs?: number;
  toolCalls?: ToolCall[];
  citations?: Citation[];
  attachments?: string[];
  /** Provider-measured token cost of this message's attachments, captured the
   *  first time a turn that includes them reports usage. Lets the context meter
   *  price files/images for real while still counting text live. */
  fileTokens?: number;
  usage?: Usage;
  /** Model id that produced an assistant message (shown in its meta line). */
  model?: string;
  /** Marks a message that ended in an error (e.g. aborted/failed request). */
  error?: string;
  createdAt: number;
}

export interface StoredFile {
  id: string;
  sessionId: string;
  messageId: string | null;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface WebDavConfig {
  /** Base WebDAV URL, e.g. https://dav.example.com/remote.php/dav/files/me/ */
  url: string;
  user: string;
  /** Password is NOT stored here — it lives in the proxy's secret store
   *  (see `src/lib/secrets.ts`), out of the snapshot / WebDAV mirror / backups. */
  /** Folder under the base URL to keep Relay's snapshot in (default `relay`). */
  path: string;
  enabled: boolean;
  /** How often to sync while the app is open, in hours (default 1). Also the
   *  spacing between versioned backups. */
  intervalHours?: number;
  /** Last successful sync (push or pull), for the Settings readout. */
  lastSyncAt?: number;
  /** How many timestamped backups to keep on the server (0/undefined = off).
   *  A new one is written each `intervalHours`; older ones are pruned. */
  backupsKeep?: number;
  /** When the last versioned backup was written (spacing + Settings readout). */
  lastWebdavBackupAt?: number;
}

export interface AppConfig {
  id: 'singleton';
  theme: 'light' | 'dark' | 'system';
  /** Include the model's "thinking" in markdown export/download (default off). */
  exportIncludeThinking?: boolean;
  /** Wrap long lines in chat code blocks rather than scrolling them (default on). */
  wrapCodeBlocks?: boolean;
  /** Auto-titling: which connection/model and the instruction prompt. */
  titleConnectionId?: string;
  titleModel?: string;
  titlePrompt?: string;
  /** Global, user-editable reasoning-effort choices offered in preset settings
   *  (the accepted set varies by model, so the list is yours to curate). */
  reasoningEfforts?: string[];
  /** Days a deleted chat stays in the trash before it is auto-purged on launch
   *  (default 10). `0` keeps trashed chats until you empty the trash yourself. */
  trashRetentionDays?: number;
  /** Scheduled local backups (run while the app is open). */
  backup?: BackupSettings;
  webdav?: WebDavConfig;
}

export interface BackupSettings {
  scheduleEnabled?: boolean;
  /** How often to write a scheduled backup, in hours. */
  intervalHours?: number;
  lastBackupAt?: number;
}
