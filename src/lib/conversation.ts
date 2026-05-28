import type { Message, Part } from '@/db/types';
import { getFilesByIds } from '@/db/repo';
import type { Attachment, ChatMessage } from '@/providers/types';
import { fileToAttachment } from './attachments';

/** Concatenate the text content of a message's parts. */
export function partsText(content: Part[]): string {
  return content
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/** Messages after the *latest* divider (plan §4/§7 "clear context, keep page"). */
function activeWindow(messages: Message[]): Message[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'divider') {
      start = i + 1;
      break;
    }
  }
  return messages.slice(start);
}

/**
 * Turn persisted messages into the provider-facing conversation, resolving
 * attachments to inline data. System prompts are handled via session settings,
 * so only user/assistant turns are sent.
 */
export async function buildChatMessages(
  messages: Message[],
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of activeWindow(messages)) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = partsText(m.content);

    let attachments: Attachment[] | undefined;
    if (m.attachments?.length) {
      const files = await getFilesByIds(m.attachments);
      const resolved = (await Promise.all(files.map(fileToAttachment))).filter(
        (a): a is Attachment => a != null,
      );
      if (resolved.length) attachments = resolved;
    }

    if (!text && !attachments) continue;
    out.push({ role: m.role, text, ...(attachments ? { attachments } : {}) });
  }
  return out;
}

/** Derive a short session title from the first user message. */
export function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  return clean.length > 48 ? clean.slice(0, 48).trimEnd() + '…' : clean;
}
