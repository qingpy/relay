import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { FlatSelect } from '@/components/ui/flat-select';
import { Slider } from '@/components/ui/slider';
import {
  listConnections,
  setSessionSystemPrompt,
  updateFolderConfig,
} from '@/db/repo';
import type { Folder, ModelSettings, Session } from '@/db/types';
import { decodeModelChoice, encodeModelChoice, modelGroups } from '@/lib/models';

const FIELD = 'flex flex-col gap-3';
const FLAT_INPUT =
  'w-full border border-input bg-transparent px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary';
const FLAT_TEXTAREA = `${FLAT_INPUT} min-h-[100px] resize-y leading-relaxed`;

function GroupHeader({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-end justify-between">
      <span className="label-mono text-muted-foreground">{label}</span>
      {value != null && (
        <span className="font-mono text-xs tabular-nums text-foreground">
          {value}
        </span>
      )}
    </div>
  );
}

export function PresetEditor({
  folder,
  session,
  open,
  onOpenChange,
}: {
  folder: Folder;
  session?: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-10 pb-5 pt-8">
          <DialogTitle>Model &amp; instructions</DialogTitle>
          <DialogDescription className="sr-only">
            Model, parameters, and system prompts for this preset.
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-col gap-8 overflow-y-auto px-10 py-8">
          <Form key={folder.id} folder={folder} session={session} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Form({ folder, session }: { folder: Folder; session?: Session }) {
  const connections = useLiveQuery(() => listConnections(), [], []);
  const [connectionId, setConnectionId] = useState(folder.connectionId ?? '');
  const [model, setModel] = useState(folder.model ?? '');
  const [settings, setSettings] = useState<ModelSettings>(folder.settings ?? {});
  const [systemPrompt, setSystemPrompt] = useState(folder.systemPrompt ?? '');
  const [chatPrompt, setChatPrompt] = useState(session?.systemPrompt ?? '');

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
    <>
      <div className={FIELD}>
        <GroupHeader label="Model" />
        <FlatSelect
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
        >
          {model && !conn?.models.some((m) => m.id === model) && (
            <option value={encodeModelChoice(connectionId, model)}>
              {model} · current
            </option>
          )}
          {groups.length === 0 && (
            <option value="">No models — add a connection</option>
          )}
          {groups.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.models.map((m) => (
                <option key={m.id} value={encodeModelChoice(c.id, m.id)}>
                  {m.label || m.id}
                </option>
              ))}
            </optgroup>
          ))}
        </FlatSelect>
      </div>

      <div className={FIELD}>
        <GroupHeader label="Temperature" value={temperature.toFixed(2)} />
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[temperature]}
          onValueChange={([v]) => saveSettings({ temperature: v })}
        />
      </div>

      <div className={FIELD}>
        <GroupHeader label="Top P" value={topP.toFixed(2)} />
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[topP]}
          onValueChange={([v]) => saveSettings({ topP: v })}
        />
      </div>

      <div className={FIELD}>
        <GroupHeader label="Max tokens" />
        <input
          type="number"
          min={1}
          placeholder="Provider default"
          value={settings.maxTokens ?? ''}
          onChange={(e) =>
            saveSettings({
              maxTokens: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={FLAT_INPUT}
        />
      </div>

      {conn?.type === 'vertex' ? (
        <div className={FIELD}>
          <GroupHeader label="Thinking budget" />
          <input
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
            className={FLAT_INPUT}
          />
        </div>
      ) : (
        <div className={FIELD}>
          <GroupHeader label="Reasoning effort" />
          <FlatSelect
            value={settings.reasoningEffort ?? 'off'}
            onChange={(e) =>
              saveSettings({
                reasoningEffort:
                  e.target.value === 'off'
                    ? undefined
                    : (e.target.value as 'low' | 'medium' | 'high'),
              })
            }
          >
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </FlatSelect>
        </div>
      )}

      <div className={FIELD}>
        <GroupHeader label="System prompt" />
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
          className={FLAT_TEXTAREA}
        />
      </div>

      {session && (
        <div className={FIELD}>
          <GroupHeader label="Chat system prompt" />
          <textarea
            value={chatPrompt}
            onChange={(e) => {
              setChatPrompt(e.target.value);
              void setSessionSystemPrompt(session.id, e.target.value);
            }}
            rows={3}
            placeholder="Appended to the preset's system prompt for this chat…"
            className={FLAT_TEXTAREA}
          />
        </div>
      )}
    </>
  );
}
