import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMessages, getSession } from '@/db/repo';
import { contextUsage, formatTokens } from '@/lib/context';
import { useResolvedConfig } from '@/lib/useResolved';

/**
 * Quiet readout of how much context this chat is using — an estimate of the
 * tokens sent next turn (system prompt + the turns after the latest divider).
 * Attachments are shown as a separate count (their token cost is provider-
 * specific, so it isn't folded into the estimate).
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
  const pct = ratio > 0 && ratio < 1 ? '<1' : String(Math.round(ratio));

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
