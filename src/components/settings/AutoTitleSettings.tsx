import { useLiveQuery } from 'dexie-react-hooks';
import { FlatSelect } from '@/components/ui/flat-select';
import { Input } from '@/components/ui/input';
import { DEFAULT_TITLE_PROMPT, getAppConfig, updateAppConfig } from '@/db/db';
import { listConnections } from '@/db/repo';
import { SectionLabel } from './SectionLabel';

export function AutoTitleSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const connections = useLiveQuery(() => listConnections(), [], []);
  if (!config) return null;

  const conn = connections.find((c) => c.id === config.titleConnectionId);

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Auto-title</SectionLabel>
      <div className="flex gap-2">
        <div className="flex-1">
          <FlatSelect
            value={config.titleConnectionId ?? ''}
            onChange={(e) => {
              const id = e.target.value || undefined;
              const c = connections.find((x) => x.id === id);
              void updateAppConfig({
                titleConnectionId: id,
                titleModel: id
                  ? config.titleModel ?? c?.models[0]?.id ?? ''
                  : undefined,
              });
            }}
          >
            <option value="">Off · use first message</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FlatSelect>
        </div>
        {config.titleConnectionId && (
          <Input
            list="title-models"
            className="flex-1"
            spellCheck={false}
            placeholder="model id"
            value={config.titleModel ?? ''}
            onChange={(e) => void updateAppConfig({ titleModel: e.target.value })}
          />
        )}
        <datalist id="title-models">
          {(conn?.models ?? []).map((m) => (
            <option key={m.id} value={m.id} />
          ))}
        </datalist>
      </div>
      {config.titleConnectionId && (
        <textarea
          value={config.titlePrompt ?? DEFAULT_TITLE_PROMPT}
          onChange={(e) =>
            void updateAppConfig({ titlePrompt: e.target.value })
          }
          rows={3}
          className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </section>
  );
}
