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
import { Switch } from '@/components/ui/switch';
import { DEFAULT_REASONING_EFFORTS, getAppConfig } from '@/db/db';
import {
  listConnections,
  setSessionSystemPrompt,
  updateFolderConfig,
} from '@/db/repo';
import type { Folder, ModelSettings, Session } from '@/db/types';
import {
  decodeModelChoice,
  encodeModelChoice,
  findModel,
  modelGroups,
  reasoningKind,
} from '@/lib/models';
import { cn } from '@/lib/utils';

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

/** A slider with an on/off switch: off omits the knob entirely (provider
 *  default), on reveals the slider with a stored value. */
function OptionalSlider({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number | undefined) => void;
}) {
  const on = value !== undefined;
  const shown = value ?? defaultValue;
  return (
    <div className={FIELD}>
      <div className="flex items-end justify-between">
        <span className="label-mono text-muted-foreground">{label}</span>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'font-mono text-xs tabular-nums',
              on ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {on ? shown.toFixed(2) : 'Default'}
          </span>
          <Switch
            checked={on}
            onCheckedChange={(v) => onChange(v ? shown : undefined)}
          />
        </div>
      </div>
      {on && (
        <Slider
          min={min}
          max={max}
          step={step}
          value={[shown]}
          onValueChange={([v]) => onChange(v)}
        />
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
  const config = useLiveQuery(() => getAppConfig(), []);
  const [connectionId, setConnectionId] = useState(folder.connectionId ?? '');
  const [model, setModel] = useState(folder.model ?? '');
  const [settings, setSettings] = useState<ModelSettings>(folder.settings ?? {});
  const [systemPrompt, setSystemPrompt] = useState(folder.systemPrompt ?? '');
  const [chatPrompt, setChatPrompt] = useState(session?.systemPrompt ?? '');

  const conn = connections.find((c) => c.id === connectionId);
  const groups = modelGroups(connections);
  const effortOptions = config?.reasoningEfforts ?? DEFAULT_REASONING_EFFORTS;
  const reasoning = conn
    ? reasoningKind(conn.type, findModel(conn, model).capabilities)
    : 'none';

  const saveSettings = (patch: Partial<ModelSettings>) => {
    // Drop undefined keys so an "off" knob is truly absent → provider default.
    const next = Object.fromEntries(
      Object.entries({ ...settings, ...patch }).filter(
        ([, v]) => v !== undefined,
      ),
    ) as ModelSettings;
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

      <OptionalSlider
        label="Temperature"
        value={settings.temperature}
        defaultValue={1}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => saveSettings({ temperature: v })}
      />

      <OptionalSlider
        label="Top P"
        value={settings.topP}
        defaultValue={1}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => saveSettings({ topP: v })}
      />

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

      {reasoning === 'budget' && (
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
      )}

      {reasoning === 'effort' && (
        <div className={FIELD}>
          <GroupHeader label="Reasoning effort" />
          <FlatSelect
            value={settings.reasoningEffort ?? ''}
            onChange={(e) =>
              saveSettings({ reasoningEffort: e.target.value || undefined })
            }
          >
            <option value="">Default</option>
            {settings.reasoningEffort &&
              !effortOptions.includes(settings.reasoningEffort) && (
                <option value={settings.reasoningEffort}>
                  {settings.reasoningEffort} · current
                </option>
              )}
            {effortOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </FlatSelect>
          <p className="text-xs text-muted-foreground">
            Edit these choices in Settings → Chats.
          </p>
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
