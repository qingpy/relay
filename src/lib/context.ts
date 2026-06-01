import type { Message } from '@/db/types';
import { activeWindow, partsText } from '@/lib/conversation';
import { activePath } from '@/lib/tree';

/**
 * Context-size readout for a chat (the "how big is this conversation getting"
 * indicator). We deliberately avoid a tokenizer dependency: the count is a
 * deterministic ~4-chars-per-token estimate over exactly what gets sent next
 * turn — the system prompt plus the user/assistant turns after the latest
 * divider. Attachments can't be token-counted without the provider, so they're
 * surfaced as a separate file count rather than guessed.
 */

export interface ContextUsage {
  /** Estimated tokens of the text actually sent (system prompt + active turns). */
  tokens: number;
  /** Attachments in the active window (not included in `tokens`). */
  files: number;
  /** Number of user/assistant turns in the active window. */
  turns: number;
}

export function contextUsage(
  messages: Message[],
  leafId: string | undefined,
  systemPrompt?: string,
): ContextUsage {
  const window = activeWindow(activePath(messages, leafId));
  let chars = systemPrompt?.length ?? 0;
  let files = 0;
  let turns = 0;
  for (const m of window) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    chars += partsText(m.content).length;
    files += m.attachments?.length ?? 0;
    turns++;
  }
  return { tokens: Math.ceil(chars / 4), files, turns };
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
