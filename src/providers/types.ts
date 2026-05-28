import type { ProviderId, SessionSettings, Usage } from '@/db/types';

/** A message as sent to a provider. Content is plain text in M1; multimodal
 *  parts (images/files) are layered in later. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface Capabilities {
  vision: boolean;
  pdf: boolean;
  reasoning: boolean;
  webSearch: boolean;
  toolUse: boolean;
}

/** A streaming event parsed from a provider's SSE chunk. */
export type Delta =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'usage'; usage: Usage }
  | { kind: 'error'; message: string };

/** What the client sends to our proxy. The proxy attaches nothing the client
 *  can't see for OpenAI-compat/Gemini (the key comes from here); for Vertex it
 *  swaps in a server-minted token. */
export interface ProxyRequest {
  /** Proxy endpoint path, e.g. `/api/chat/openai`. */
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface BuildInput {
  model: string;
  messages: ChatMessage[];
  settings: SessionSettings;
  apiKey?: string;
  baseUrl?: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  capabilities: Capabilities;
  /** Default upstream base URL (OpenAI-compatible providers). */
  defaultBaseUrl?: string;
  /** Build the request we POST to the proxy. */
  buildRequest(input: BuildInput): ProxyRequest;
  /** Parse one SSE `data:` payload into zero or more deltas. */
  parseStreamChunk(data: string): Delta[];
}
