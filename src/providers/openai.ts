import type { ProviderId } from '@/db/types';
import type {
  BuildInput,
  Capabilities,
  ChatMessage,
  Delta,
  Provider,
  ProxyRequest,
} from './types';

/** Build OpenAI message content: a plain string when there are no binary
 *  attachments, otherwise the multimodal parts array. Text attachments are
 *  inlined into the text so any model can read them. */
function toContent(m: ChatMessage): unknown {
  const atts = m.attachments ?? [];
  const textFiles = atts.filter((a) => a.kind === 'text');
  const binary = atts.filter((a) => a.kind !== 'text');

  let text = m.text;
  for (const f of textFiles) {
    text += `\n\n[file: ${f.name}]\n\`\`\`\n${f.data}\n\`\`\``;
  }

  if (binary.length === 0) return text;

  const parts: unknown[] = [{ type: 'text', text }];
  for (const f of binary) {
    if (f.kind === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${f.mimeType};base64,${f.data}` },
      });
    } else {
      parts.push({
        type: 'file',
        file: {
          filename: f.name,
          file_data: `data:${f.mimeType};base64,${f.data}`,
        },
      });
    }
  }
  return parts;
}

interface OpenAIAnnotation {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
    content?: string;
    start_index?: number;
    end_index?: number;
  };
}

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIChunk {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAIToolCallDelta[];
      annotations?: OpenAIAnnotation[];
    };
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
        ...messages.map((m) => ({ role: m.role, content: toContent(m) })),
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

    for (const tc of choice?.delta?.tool_calls ?? []) {
      deltas.push({
        kind: 'toolCallDelta',
        index: tc.index,
        id: tc.id,
        name: tc.function?.name,
        argsDelta: tc.function?.arguments,
      });
    }

    const citations = (choice?.delta?.annotations ?? [])
      .filter((a) => a.type === 'url_citation' && a.url_citation?.url)
      .map((a) => ({
        url: a.url_citation!.url!,
        title: a.url_citation!.title,
        snippet: a.url_citation!.content,
        start: a.url_citation!.start_index,
        end: a.url_citation!.end_index,
      }));
    if (citations.length) deltas.push({ kind: 'citation', citations });

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
