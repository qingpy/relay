import type {
  Citation,
  ConnectionType,
  ModelCapabilities,
  ProviderSettings,
  ToolCall,
  Usage,
} from '@/db/types';

/** UI capability gate type (same shape as a model's saved capabilities). */
export type Capabilities = ModelCapabilities;

/** A binary/text attachment resolved to inline data, ready to send. */
export interface Attachment {
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mimeType: string;
  /** base64 (no data: prefix) for image/pdf; UTF-8 text for `text`. */
  data: string;
}

/** A message as sent to a provider. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  attachments?: Attachment[];
}

/** A streaming event parsed from a provider's SSE chunk. */
export type Delta =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  /** OpenAI-style fragmented tool call (arguments stream in pieces). */
  | { kind: 'toolCallDelta'; index: number; id?: string; name?: string; argsDelta?: string }
  /** A complete tool call delivered in one piece (Gemini functionCall). */
  | { kind: 'toolCall'; call: ToolCall }
  | { kind: 'citation'; citations: Citation[] }
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
  settings: ProviderSettings;
  apiKey?: string;
  baseUrl?: string;
  /** Vertex only. */
  project?: string;
  region?: string;
}

export interface Provider {
  type: ConnectionType;
  /** Build the request we POST to the proxy. */
  buildRequest(input: BuildInput): ProxyRequest;
  /** Parse one SSE `data:` payload into zero or more deltas. */
  parseStreamChunk(data: string): Delta[];
}
