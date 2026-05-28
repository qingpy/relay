import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { APP_CONFIG_ID, db, DEFAULT_APP_CONFIG, updateAppConfig } from '@/db/db';
import type { AppConfig, ProviderId, ProviderKeyConfig } from '@/db/types';
import { listProviders, MODEL_SUGGESTIONS } from '@/providers/registry';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/store/ui';
import { PromptsManager } from './PromptsManager';

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  // Read-only in the live query (writes aren't allowed here); fall back to
  // defaults until the singleton is first persisted by an edit.
  const stored = useLiveQuery(() => db.appConfig.get(APP_CONFIG_ID), []);
  const config: AppConfig = stored ?? DEFAULT_APP_CONFIG;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            API keys are stored only in this browser (IndexedDB) and sent per
            request through the local proxy.
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 flex flex-col gap-5 overflow-y-auto pr-2">
          <SettingsForm config={config} />
          <PromptsManager />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const labelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

function SettingsForm({ config }: { config: AppConfig }) {
  // Local state seeded from config; the form remounts on each open (Radix
  // unmounts dialog content when closed), so this stays in sync.
  const [defaultProvider, setDefaultProvider] = useState(config.defaultProvider);
  const [defaultModel, setDefaultModel] = useState(config.defaultModel);
  const [keys, setKeys] = useState<
    Partial<Record<ProviderId, ProviderKeyConfig>>
  >(config.providerKeys);

  const updateKey = (id: ProviderId, patch: Partial<ProviderKeyConfig>) => {
    setKeys((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      void updateAppConfig({ providerKeys: next });
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className={labelClass}>Defaults for new chats</h3>
        <div className="flex gap-2">
          <select
            value={defaultProvider}
            onChange={(e) => {
              const p = e.target.value as ProviderId;
              const model = MODEL_SUGGESTIONS[p]?.[0] ?? defaultModel;
              setDefaultProvider(p);
              setDefaultModel(model);
              void updateAppConfig({ defaultProvider: p, defaultModel: model });
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {listProviders().map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Input
            list="settings-default-models"
            value={defaultModel}
            spellCheck={false}
            onChange={(e) => {
              setDefaultModel(e.target.value);
              void updateAppConfig({ defaultModel: e.target.value });
            }}
            placeholder="model id"
          />
          <datalist id="settings-default-models">
            {(MODEL_SUGGESTIONS[defaultProvider] ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className={labelClass}>Provider keys</h3>
        {listProviders().map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{p.label}</label>
            <Input
              type="password"
              autoComplete="off"
              placeholder="API key"
              value={keys[p.id]?.apiKey ?? ''}
              onChange={(e) => updateKey(p.id, { apiKey: e.target.value })}
            />
            {p.defaultBaseUrl && (
              <Input
                spellCheck={false}
                placeholder={`Base URL (default: ${p.defaultBaseUrl})`}
                value={keys[p.id]?.baseUrl ?? ''}
                onChange={(e) => updateKey(p.id, { baseUrl: e.target.value })}
              />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
