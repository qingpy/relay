/**
 * Domain model for Relay. Mirrors plan §4 (Data Model).
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
}

/**
 * A user-defined upstream: a name, a protocol, credentials, and a saved model
 * catalog. Multiple connections may share a protocol (e.g. two OpenAI-compatible
 * endpoints). API keys live here in IndexedDB; Vertex auth stays server-side.
 */
export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  /** Base URL for OpenAI-compatible endpoints. */
  baseUrl?: string;
  /** API key (browser-stored). Not used by Vertex (server-side auth). */
  apiKey?: string;
  models: SavedModel[];
  /** Vertex project id (auth JSON is server-side). */
  project?: string;
  /** Vertex region, e.g. `us-central1`. */
  region?: string;
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
  /** OpenAI-style reasoning effort. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Gemini-style thinking token budget. */
  thinkingBudget?: number;
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
  url: string;
  user: string;
  pass: string;
  path: string;
  enabled: boolean;
}

export interface AppConfig {
  id: 'singleton';
  theme: 'light' | 'dark' | 'system';
  /** Include the model's "thinking" in markdown export/download (default off). */
  exportIncludeThinking?: boolean;
  /** Auto-titling: which connection/model and the instruction prompt. */
  titleConnectionId?: string;
  titleModel?: string;
  titlePrompt?: string;
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
