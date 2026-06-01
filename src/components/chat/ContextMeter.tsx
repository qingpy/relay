import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMessages, getSession } from '@/db/repo';
import { contextUsage, formatTokens } from '@/lib/context';
import { useResolvedConfig } from '@/lib/useResolved';

/**
 * Quiet readout of how much context this chat is using — a live estimate of the
 * tokens the next turn will send, recomputed from the current window so edits
 * and deletions show up immediately. Text is a ~4-chars/token estimate; files
 * are priced from the provider's last measurement (so they count too). Under 1%
 * the share is shown to one decimal (".3%"); a trailing file count only appears
 * for attachments no turn has measured yet.
 */
export function ContextMeter({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  const messages = useLiveQuery(() => getMessages(sessionId), [sessionId], []);
  const resolved = useResolvedConfig(sessionId);

  const usage = useMemo(
    () =>
      contextUsage(
        messages,
        session?.currentLeafId,
        resolved?.settings.systemPrompt,
      ),
    [messages, session?.currentLeafId, resolved?.settings.systemPrompt],
  );

  if (usage.tokens === 0 && usage.files === 0) return null;

  // With a context window configured for the model, report usage as a share of
  // it; otherwise fall back to the absolute token estimate.
  const window = resolved?.contextWindow;
  const showPct = !!window && usage.tokens > 0;
  const ratio = showPct ? (usage.tokens / window!) * 100 : 0;
  // Whole numbers at or above 1%; below it, one decimal with no leading zero
  // (".3%"), floored at ".1%" so any real usage still registers.
  const oneDec = Math.round(ratio * 10) / 10;
  const pct =
    oneDec >= 1
      ? String(Math.round(ratio))
      : Math.max(0.1, oneDec).toFixed(1).replace(/^0/, '');

  return (
    <span
      className="label-mono hidden shrink-0 text-muted-foreground sm:inline"
      title={
        showPct
          ? `${formatTokens(usage.tokens)} of ${formatTokens(window!)} tokens`
          : undefined
      }
    >
      {showPct ? `${pct}% ctx` : `${formatTokens(usage.tokens)} ctx`}
      {usage.files > 0 && ` · ${usage.files} file${usage.files === 1 ? '' : 's'}`}
    </span>
  );
}
