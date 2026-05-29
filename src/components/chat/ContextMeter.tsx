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

  return (
    <span
      className="label-mono hidden shrink-0 text-muted-foreground sm:inline"
      title={
        `≈ ${usage.tokens.toLocaleString()} tokens across ${usage.turns} ` +
        `message${usage.turns === 1 ? '' : 's'} in context (after the last ` +
        `divider), estimated from text` +
        (usage.files
          ? ` · ${usage.files} attachment${usage.files === 1 ? '' : 's'} not counted`
          : '')
      }
    >
      ~{formatTokens(usage.tokens)} ctx
      {usage.files > 0 && ` · ${usage.files} file${usage.files === 1 ? '' : 's'}`}
    </span>
  );
}
