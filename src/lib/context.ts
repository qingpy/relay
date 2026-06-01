import type { Message } from '@/db/types';
import { activeWindow, partsText } from '@/lib/conversation';
import { activePath } from '@/lib/tree';

/**
 * Context-size readout for a chat (the "how big is this conversation getting"
 * indicator). We count what we can count and measure what we can't: text is a
 * deterministic ~4-chars-per-token estimate, while each message's files/images
 * carry a real token cost the provider reported (`message.fileTokens`, captured
 * once when a turn including them is measured — see `store/chat.ts`).
 *
 * Both are summed over the *current* window, so editing or deleting a message
 * updates the figure immediately: drop a message and its text and its stored
 * file cost both leave the sum. Attachments no turn has measured yet can't be
 * priced, so they're surfaced as a separate count rather than guessed.
 */

export interface ContextUsage {
  /** Estimated tokens the next turn will send: text (chars/4) + measured files. */
  tokens: number;
  /** Attachments not yet folded into `tokens` (no turn has measured them). */
  files: number;
}

export function contextUsage(
  messages: Message[],
  leafId: string | undefined,
  systemPrompt?: string,
): ContextUsage {
  const window = activeWindow(activePath(messages, leafId));
  let textChars = systemPrompt?.length ?? 0;
  let fileTokens = 0;
  let unmeasuredFiles = 0;
  for (const m of window) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    textChars += partsText(m.content).length;
    const attachments = m.attachments?.length ?? 0;
    if (!attachments) continue;
    if (m.fileTokens != null) fileTokens += m.fileTokens;
    else unmeasuredFiles += attachments;
  }
  return {
    tokens: Math.ceil(textChars / 4) + fileTokens,
    files: unmeasuredFiles,
  };
}

/** Compact token label: 950 / 3.2k / 12k / 1M / 1.5M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Parse a human context-window entry into a token count. Accepts a bare number
 * (`32000`), a `k` suffix (`128k`), or an `m` suffix (`1m`, `1.5m`); commas and
 * spacing are ignored. Returns undefined for blank or unparseable input (which
 * means "no limit set").
 */
export function parseTokenCount(input: string): number | undefined {
  const m = input.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
  if (!m) return undefined;
  const scale = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1000 : 1;
  const n = Math.round(parseFloat(m[1]) * scale);
  return n > 0 ? n : undefined;
}
