/**
 * Domain model for Relay. Mirrors plan §4 (Data Model).
 *
 * IDs are app-generated strings (crypto.randomUUID) so records can be created
 * offline and synced without a server assigning keys.
 */

export type ProviderId = 'openrouter' | 'openai' | 'gemini' | 'vertex';

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

export interface SessionSettings {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** OpenAI-style reasoning effort. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Gemini-style thinking token budget. */
  thinkingBudget?: number;
  webSearch: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: number;
}

export interface Session {
  id: string;
  folderId: string | null;
  title: string;
  provider: ProviderId;
  model: string;
  settings: SessionSettings;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface Message {
  id: string;
  sessionId: string;
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

/** Per-provider stored API key (entered in the UI, kept in IndexedDB). */
export interface ProviderKeyConfig {
  apiKey?: string;
  /** Override base URL for OpenAI-compatible providers. */
  baseUrl?: string;
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
  providerKeys: Partial<Record<ProviderId, ProviderKeyConfig>>;
  theme: 'light' | 'dark' | 'system';
  defaultProvider: ProviderId;
  defaultModel: string;
  webdav?: WebDavConfig;
}
