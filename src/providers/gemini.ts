import type { BuildInput, ChatMessage, Delta } from './types';

/** Build Gemini content parts: text (+ inlined text files) then inlineData
 *  parts for images/PDFs. */
function toParts(m: ChatMessage): unknown[] {
  const atts = m.attachments ?? [];
  let text = m.text;
  for (const f of atts.filter((a) => a.kind === 'text')) {
    text += `\n\n[file: ${f.name}]\n\`\`\`\n${f.data}\n\`\`\``;
  }

  const parts: unknown[] = [{ text }];
  for (const f of atts.filter((a) => a.kind !== 'text')) {
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }
  return parts;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string };
}

/** The Gemini `generateContent` request body — shared by AI Studio and Vertex. */
export function geminiPayload({
  messages,
  settings,
}: Pick<BuildInput, 'messages' | 'settings'>): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {};
  if (settings.temperature != null)
    generationConfig.temperature = settings.temperature;
  if (settings.topP != null) generationConfig.topP = settings.topP;
  if (settings.maxTokens != null)
    generationConfig.maxOutputTokens = settings.maxTokens;
  if (settings.reasoningEffort) {
    generationConfig.thinkingConfig = {
      thinkingLevel: settings.reasoningEffort,
      includeThoughts: true,
    };
  }

  const payload: Record<string, unknown> = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toParts(m),
    })),
    generationConfig,
  };

  if (settings.systemPrompt) {
    payload.systemInstruction = { parts: [{ text: settings.systemPrompt }] };
  }
  if (settings.webSearch) {
    payload.tools = [{ google_search: {} }];
  }
  return payload;
}

/** Parse one Gemini SSE chunk (also used by Vertex, same shape). */
export function parseGeminiChunk(data: string): Delta[] {
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
  const candidate = chunk.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    if (part.functionCall?.name) {
      deltas.push({
        kind: 'toolCall',
        call: {
          id: part.functionCall.name,
          name: part.functionCall.name,
          args: part.functionCall.args,
        },
      });
    }
    if (!part.text) continue;
    deltas.push(
      part.thought
        ? { kind: 'reasoning', text: part.text }
        : { kind: 'text', text: part.text },
    );
  }

  const grounding = candidate?.groundingMetadata?.groundingChunks ?? [];
  const citations = grounding
    .filter((g) => g.web?.uri)
    .map((g) => ({ url: g.web!.uri!, title: g.web!.title }));
  if (citations.length) deltas.push({ kind: 'citation', citations });

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
