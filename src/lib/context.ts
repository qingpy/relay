import type { Message, StoredFile } from '@/db/types';
import { classify } from '@/lib/attachments';
import { activeWindow, partsText } from '@/lib/conversation';
import { activePath } from '@/lib/tree';

/**
 * Context-size readout for a chat (the "how big is this conversation getting"
 * indicator), one figure with no side-channels. Text is a deterministic
 * ~4-chars-per-token estimate. Attachments count via the real token cost the
 * provider reported (`message.fileTokens`, captured once a turn including them
 * is measured — see `store/chat.ts`); until then they carry a size-based
 * provisional estimate, replaced by the measurement after the first reply.
 *
 * Everything is summed over the *current* window, so editing or deleting a
 * message updates the figure immediately: drop a message and its text and its
 * file cost both leave the sum.
 */

/** Rough cost of an image attachment until a turn measures it. */
const IMAGE_TOKENS = 800;
/** Observed bytes-per-token for typical PDFs (text + layout). */
const PDF_BYTES_PER_TOKEN = 70;

function estimateFileTokens(file: StoredFile): number {
  const kind = classify(file.mimeType, file.name);
  if (kind === 'image') return IMAGE_TOKENS;
  if (kind === 'pdf') return Math.ceil(file.size / PDF_BYTES_PER_TOKEN);
  return Math.ceil(file.size / 4); // text files: bytes ≈ chars
}

/** Estimated tokens the next turn will send over the current window. */
export function contextTokens(
  messages: Message[],
  leafId: string | undefined,
  systemPrompt: string | undefined,
  files: StoredFile[],
): number {
  const byId = new Map(files.map((f) => [f.id, f]));
  const window = activeWindow(activePath(messages, leafId));
  let textChars = systemPrompt?.length ?? 0;
  let fileTokens = 0;
  for (const m of window) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    textChars += partsText(m.content).length;
    if (!m.attachments?.length) continue;
    if (m.fileTokens != null) {
      fileTokens += m.fileTokens;
    } else {
      for (const id of m.attachments) {
        const f = byId.get(id);
        if (f) fileTokens += estimateFileTokens(f);
      }
    }
  }
  return Math.ceil(textChars / 4) + fileTokens;
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
