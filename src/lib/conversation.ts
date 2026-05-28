import type { Message, Part } from '@/db/types';
import type { ChatMessage } from '@/providers/types';

/** Concatenate the text content of a message's parts. */
export function partsText(content: Part[]): string {
  return content
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * Turn persisted messages into the provider-facing conversation.
 *
 * Messages before the *latest* divider are excluded from the model context
 * (plan §4/§7 "clear context, keep page"); system messages are handled via
 * session settings, so only user/assistant turns are sent.
 */
export function toChatMessages(messages: Message[]): ChatMessage[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'divider') {
      start = i + 1;
      break;
    }
  }

  const out: ChatMessage[] = [];
  for (const m of messages.slice(start)) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = partsText(m.content);
    if (!text) continue;
    out.push({ role: m.role, text });
  }
  return out;
}

/** Derive a short session title from the first user message. */
export function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  return clean.length > 48 ? clean.slice(0, 48).trimEnd() + '…' : clean;
}
