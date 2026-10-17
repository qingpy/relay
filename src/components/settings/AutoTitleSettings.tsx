import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fieldClass } from '@/components/ui/input';
import { FlatSelect } from '@/components/ui/flat-select';
import { Marginalia } from '@/components/ui/marginalia';
import { DEFAULT_TITLE_PROMPT, getAppConfig, updateAppConfig } from '@/db/db';
import { listConnections } from '@/db/repo';
import { SectionLabel } from './SectionLabel';

export function AutoTitleSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const connections = useLiveQuery(() => listConnections(), [], []);

  // Local buffer for the prompt. Binding it straight to the live Dexie query
  // round-tripped every keystroke through the DB before the value came back,
  // which reset the caret to the end and broke IME composition.
  const [titlePrompt, setTitlePrompt] = useState<string | null>(null);

  useEffect(() => {
    if (config && titlePrompt === null) {
      setTitlePrompt(config.titlePrompt ?? DEFAULT_TITLE_PROMPT);
    }
  }, [config, titlePrompt]);

  if (!config) return null;

  const conn = connections.find((c) => c.id === config.titleConnectionId);
  const models = conn?.models ?? [];
  // Unset follows the built-in default (and its future updates); only a
  // customized prompt is stored. Empty is a real choice: no prompt.
  const savePrompt = (v: string) => {
    setTitlePrompt(v);
    void updateAppConfig({ titlePrompt: v === DEFAULT_TITLE_PROMPT ? undefined : v });
  };
  const reset = () => {
    setTitlePrompt(DEFAULT_TITLE_PROMPT);
    void updateAppConfig({ titlePrompt: undefined });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Auto-title</SectionLabel>
        {config.titleConnectionId && config.titlePrompt !== undefined && (
          <Marginalia onClick={reset}>Reset</Marginalia>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <FlatSelect
            value={config.titleConnectionId ?? ''}
            onChange={(e) => {
              const id = e.target.value || undefined;
              const c = connections.find((x) => x.id === id);
              const keep =
                id &&
                config.titleModel &&
                c?.models.some((m) => m.id === config.titleModel);
              const nextModel = keep
                ? config.titleModel
                : (c?.models[0]?.id ?? '');
              void updateAppConfig({
                titleConnectionId: id,
                titleModel: id ? nextModel : undefined,
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
          <div className="flex-1">
            <FlatSelect
              value={config.titleModel ?? ''}
              onChange={(e) => {
                void updateAppConfig({ titleModel: e.target.value });
              }}
            >
              {config.titleModel &&
                !models.some((m) => m.id === config.titleModel) && (
                  <option value={config.titleModel}>
                    {config.titleModel} · current
                  </option>
                )}
              {models.length === 0 && !config.titleModel && (
                <option value="">No models in this connection</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
            </FlatSelect>
          </div>
        )}
      </div>
      {config.titleConnectionId && (
        <textarea
          value={titlePrompt ?? DEFAULT_TITLE_PROMPT}
          onChange={(e) => savePrompt(e.target.value)}
          rows={3}
          className={`${fieldClass} resize-y`}
        />
      )}
    </section>
  );
}
