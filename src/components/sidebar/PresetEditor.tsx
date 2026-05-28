import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  listConnections,
  renameFolder,
  updateFolderConfig,
} from '@/db/repo';
import type { Folder, ModelSettings } from '@/db/types';
import { decodeModelChoice, encodeModelChoice, modelGroups } from '@/lib/models';

const SECTION = 'flex flex-col gap-1.5';
const ROW = 'flex items-center justify-between text-sm';
const labelClass = 'text-sm font-medium';

export function PresetEditor({
  folder,
  open,
  onOpenChange,
}: {
  folder: Folder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Preset</DialogTitle>
          <DialogDescription>
            Sets the model, settings, and system prompt shared by every chat in
            this preset.
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 overflow-y-auto pr-2">
          <Form key={folder.id} folder={folder} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Form({ folder }: { folder: Folder }) {
  const connections = useLiveQuery(() => listConnections(), [], []);
  const [name, setName] = useState(folder.name);
  const [connectionId, setConnectionId] = useState(folder.connectionId ?? '');
  const [model, setModel] = useState(folder.model ?? '');
  const [settings, setSettings] = useState<ModelSettings>(folder.settings ?? {});
  const [systemPrompt, setSystemPrompt] = useState(folder.systemPrompt ?? '');

  const conn = connections.find((c) => c.id === connectionId);
  const groups = modelGroups(connections);
  const temperature = settings.temperature ?? 1;
  const topP = settings.topP ?? 1;

  const saveSettings = (patch: Partial<ModelSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void updateFolderConfig(folder.id, { settings: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={SECTION}>
        <label className={labelClass}>Name</label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            void renameFolder(folder.id, e.target.value);
          }}
        />
      </div>

      <div className={SECTION}>
        <label className={labelClass}>Model</label>
        <select
          value={encodeModelChoice(connectionId, model)}
          onChange={(e) => {
            const next = decodeModelChoice(e.target.value);
            setConnectionId(next.connectionId);
            setModel(next.model);
            void updateFolderConfig(folder.id, {
              connectionId: next.connectionId || null,
              model: next.model,
            });
          }}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {model && !conn?.models.some((m) => m.id === model) && (
            <option value={encodeModelChoice(connectionId, model)}>
              {model} (current)
            </option>
          )}
          {groups.length === 0 && <option value="">No models — add a connection</option>}
          {groups.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.models.map((m) => (
                <option key={m.id} value={encodeModelChoice(c.id, m.id)}>
                  {m.label || m.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className={SECTION}>
        <div className={ROW}>
          <span className="font-medium">Temperature</span>
          <span className="tabular-nums text-muted-foreground">
            {temperature.toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[temperature]}
          onValueChange={([v]) => saveSettings({ temperature: v })}
        />
      </div>

      <div className={SECTION}>
        <div className={ROW}>
          <span className="font-medium">Top P</span>
          <span className="tabular-nums text-muted-foreground">
            {topP.toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[topP]}
          onValueChange={([v]) => saveSettings({ topP: v })}
        />
      </div>

      <div className={SECTION}>
        <label className={labelClass}>Max tokens</label>
        <Input
          type="number"
          min={1}
          placeholder="Provider default"
          value={settings.maxTokens ?? ''}
          onChange={(e) =>
            saveSettings({
              maxTokens: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      {conn?.type === 'vertex' ? (
        <div className={SECTION}>
          <label className={labelClass}>Thinking budget (tokens)</label>
          <Input
            type="number"
            min={0}
            placeholder="Auto"
            value={settings.thinkingBudget ?? ''}
            onChange={(e) =>
              saveSettings({
                thinkingBudget: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
      ) : (
        <div className={SECTION}>
          <label className={labelClass}>Reasoning effort</label>
          <select
            value={settings.reasoningEffort ?? 'off'}
            onChange={(e) =>
              saveSettings({
                reasoningEffort:
                  e.target.value === 'off'
                    ? undefined
                    : (e.target.value as 'low' | 'medium' | 'high'),
              })
            }
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      )}

      <div className={SECTION}>
        <label className={labelClass}>System prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            void updateFolderConfig(folder.id, {
              systemPrompt: e.target.value || undefined,
            });
          }}
          rows={5}
          placeholder="Shared instructions for chats in this preset…"
          className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
