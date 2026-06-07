import type { Message } from '@/db/types';
import { activeWindow } from '@/lib/conversation';
import { activePath } from '@/lib/tree';

/**
 * Context-size readout for a chat, taken straight from the provider — no
 * chars-per-token or file-size estimating, no per-message attribution. The
 * figure is the reported usage of the last measured turn in the current
 * window (the same model Codex and Claude Code use: the last response's
 * token count *is* the context size, refreshed once per turn). Because the
 * anchor is found by walking the active path, deleting the tail, switching
 * branches, and regenerating all snap to the right measurement instantly;
 * editing *above* a measured turn leaves the figure quietly stale until the
 * next reply re-measures. With nothing measured in the window (a fresh chat,
 * or a divider cutting off every measured turn) the meter stays hidden.
 */
export function measuredContextTokens(
  messages: Message[],
  leafId: string | undefined,
): number | undefined {
  const window = activeWindow(activePath(messages, leafId));
  for (let i = window.length - 1; i >= 0; i--) {
    const u = window[i].usage;
    if (!u) continue;
    if (u.totalTokens != null) return u.totalTokens;
    if (u.promptTokens != null || u.completionTokens != null)
      return (u.promptTokens ?? 0) + (u.completionTokens ?? 0);
  }
  return undefined;
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
