import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMessages, getSession } from '@/db/repo';
import { measuredContextTokens, formatTokens } from '@/lib/context';
import { useResolvedConfig } from '@/lib/useResolved';

/**
 * Quiet readout of how much context this chat is using — the provider-reported
 * usage of the last measured turn in the current window, nothing estimated,
 * refreshed as each reply lands. Hidden until a turn has been measured. Under
 * 1% the share is shown to one decimal (".3%").
 */
export function ContextMeter({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  const messages = useLiveQuery(() => getMessages(sessionId), [sessionId], []);
  const resolved = useResolvedConfig(sessionId);

  const tokens = useMemo(
    () => measuredContextTokens(messages, session?.currentLeafId),
    [messages, session?.currentLeafId],
  );

  if (!tokens) return null;

  // With a context window configured for the model, report usage as a share of
  // it; otherwise fall back to the absolute token count.
  const window = resolved?.contextWindow;
  const ratio = window ? (tokens / window) * 100 : 0;
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
        window
          ? `${formatTokens(tokens)} of ${formatTokens(window)} tokens`
          : undefined
      }
    >
      {window ? `${pct}% ctx` : `${formatTokens(tokens)} ctx`}
    </span>
  );
}
