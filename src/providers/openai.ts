import type { ProviderId } from '@/db/types';
import type {
  BuildInput,
  Capabilities,
  Delta,
  Provider,
  ProxyRequest,
} from './types';

interface OpenAIChunk {
  choices?: {
    delta?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  } | null;
  error?: { message?: string };
}

/**
 * Covers OpenAI, OpenRouter, and any OpenAI-compatible base URL. OpenRouter and
 * OpenAI differ only in `defaultBaseUrl` and a few extension fields (reasoning,
 * web search), branched on `id`.
 */
export class OpenAICompatProvider implements Provider {
  constructor(
    readonly id: ProviderId,
    readonly label: string,
    readonly defaultBaseUrl: string,
    readonly capabilities: Capabilities,
  ) {}

  buildRequest({
    model,
    messages,
    settings,
    apiKey,
    baseUrl,
  }: BuildInput): ProxyRequest {
    const body: Record<string, unknown> = {
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        ...(settings.systemPrompt
          ? [{ role: 'system', content: settings.systemPrompt }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
    };

    if (settings.temperature != null) body.temperature = settings.temperature;
    if (settings.topP != null) body.top_p = settings.topP;
    if (settings.maxTokens != null) body.max_tokens = settings.maxTokens;

    if (settings.reasoningEffort) {
      if (this.id === 'openrouter') {
        body.reasoning = { effort: settings.reasoningEffort };
      } else {
        body.reasoning_effort = settings.reasoningEffort;
      }
    }

    // OpenRouter native web search plugin.
    if (settings.webSearch && this.id === 'openrouter') {
      body.plugins = [{ id: 'web' }];
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    return {
      url: '/api/chat/openai',
      headers,
      body: { baseUrl: baseUrl || this.defaultBaseUrl, payload: body },
    };
  }

  parseStreamChunk(data: string): Delta[] {
    let chunk: OpenAIChunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return [];
    }

    if (chunk.error?.message) {
      return [{ kind: 'error', message: chunk.error.message }];
    }

    const deltas: Delta[] = [];
    const choice = chunk.choices?.[0];
    const reasoning = choice?.delta?.reasoning;
    if (reasoning) deltas.push({ kind: 'reasoning', text: reasoning });
    const content = choice?.delta?.content;
    if (content) deltas.push({ kind: 'text', text: content });

    if (chunk.usage) {
      deltas.push({
        kind: 'usage',
        usage: {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
          reasoningTokens:
            chunk.usage.completion_tokens_details?.reasoning_tokens,
        },
      });
    }

    return deltas;
  }
}
