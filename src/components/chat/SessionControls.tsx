import { useLiveQuery } from 'dexie-react-hooks';
import { configureSession, getSession } from '@/db/repo';
import type { ProviderId } from '@/db/types';
import { listProviders, MODEL_SUGGESTIONS } from '@/providers/registry';

const selectClass =
  'h-8 rounded-md border border-input bg-transparent pl-2.5 pr-7 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring';

export function SessionControls({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  if (!session) return null;

  const suggestions = MODEL_SUGGESTIONS[session.provider] ?? [];
  const listId = `models-${sessionId}`;

  const onProvider = (provider: ProviderId) => {
    const model = MODEL_SUGGESTIONS[provider]?.[0] ?? '';
    configureSession(sessionId, { provider, model });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        value={session.provider}
        onChange={(e) => onProvider(e.target.value as ProviderId)}
        className={selectClass}
        title="Provider"
      >
        {listProviders().map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        list={listId}
        value={session.model}
        onChange={(e) => configureSession(sessionId, { model: e.target.value })}
        placeholder="model id"
        spellCheck={false}
        className="h-8 w-48 min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        title="Model"
      />
      <datalist id={listId}>
        {suggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}
