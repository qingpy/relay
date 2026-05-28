import type { ProviderId } from '@/db/types';
import type {
  BuildInput,
  Capabilities,
  Delta,
  Provider,
  ProxyRequest,
} from './types';

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string };
}

/**
 * Gemini AI Studio (and later Vertex — same `generateContent` body, different
 * endpoint/auth decided by the proxy).
 */
export class GeminiProvider implements Provider {
  readonly defaultBaseUrl = undefined;

  constructor(
    readonly id: ProviderId,
    readonly label: string,
    readonly capabilities: Capabilities,
  ) {}

  buildRequest({ model, messages, settings, apiKey }: BuildInput): ProxyRequest {
    const generationConfig: Record<string, unknown> = {};
    if (settings.temperature != null)
      generationConfig.temperature = settings.temperature;
    if (settings.topP != null) generationConfig.topP = settings.topP;
    if (settings.maxTokens != null)
      generationConfig.maxOutputTokens = settings.maxTokens;
    if (settings.thinkingBudget != null) {
      generationConfig.thinkingConfig = {
        thinkingBudget: settings.thinkingBudget,
        includeThoughts: true,
      };
    }

    const payload: Record<string, unknown> = {
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      generationConfig,
    };

    if (settings.systemPrompt) {
      payload.systemInstruction = { parts: [{ text: settings.systemPrompt }] };
    }
    if (settings.webSearch) {
      payload.tools = [{ google_search: {} }];
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    return { url: '/api/chat/gemini', headers, body: { model, payload } };
  }

  parseStreamChunk(data: string): Delta[] {
    let chunk: GeminiChunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return [];
    }

    if (chunk.error?.message) {
      return [{ kind: 'error', message: chunk.error.message }];
    }

    const deltas: Delta[] = [];
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (!part.text) continue;
      deltas.push(
        part.thought
          ? { kind: 'reasoning', text: part.text }
          : { kind: 'text', text: part.text },
      );
    }

    const u = chunk.usageMetadata;
    if (u) {
      deltas.push({
        kind: 'usage',
        usage: {
          promptTokens: u.promptTokenCount,
          completionTokens: u.candidatesTokenCount,
          totalTokens: u.totalTokenCount,
          reasoningTokens: u.thoughtsTokenCount,
        },
      });
    }

    return deltas;
  }
}
