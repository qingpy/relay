import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getAppConfig, updateAppConfig } from '@/db/db';
import {
  createConnection,
  deleteConnection,
  listConnections,
  setConnectionModels,
  updateConnection,
} from '@/db/repo';
import type {
  Connection,
  ConnectionType,
  ModelCapabilities,
  SavedModel,
} from '@/db/types';
import { detectModels } from '@/lib/detect';
import { toSavedModel } from '@/lib/models';
import { cn } from '@/lib/utils';
import { ModelPicker } from './ModelPicker';

const labelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

const TYPE_LABEL: Record<ConnectionType, string> = {
  openai: 'OpenAI-compatible',
  gemini: 'Gemini',
  vertex: 'Vertex AI',
};

/** Connection fields safe to edit as raw JSON (creds + endpoint). */
const EDITABLE_KEYS = ['name', 'type', 'baseUrl', 'apiKey', 'project', 'region'] as const;

export function ConnectionsManager() {
  const connections = useLiveQuery(() => listConnections(), [], []);
  const config = useLiveQuery(() => getAppConfig(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  const add = async (type: ConnectionType) => {
    const c = await createConnection({ type });
    setOpenId(c.id);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className={labelClass}>Connections</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <Plus className="size-3.5" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(TYPE_LABEL) as ConnectionType[]).map((t) => (
              <DropdownMenuItem key={t} onSelect={() => void add(t)}>
                {TYPE_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {connections.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No connections yet — add one to start chatting.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {connections.map((c) => (
          <ConnectionCard
            key={c.id}
            conn={c}
            isDefault={config?.defaultConnectionId === c.id}
            open={openId === c.id}
            onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
          />
        ))}
      </div>
    </section>
  );
}

function connectionJson(conn: Connection): string {
  const subset: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) {
    if (conn[k] !== undefined) subset[k] = conn[k];
  }
  return JSON.stringify(subset, null, 2);
}

function ConnectionCard({
  conn,
  isDefault,
  open,
  onToggle,
}: {
  conn: Connection;
  isDefault: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [json, setJson] = useState(() => connectionJson(conn));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [newModel, setNewModel] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [picker, setPicker] = useState<string[] | null>(null);

  const setModels = (models: SavedModel[]) =>
    void setConnectionModels(conn.id, models);

  const saveJson = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    if (
      parsed.type !== 'openai' &&
      parsed.type !== 'gemini' &&
      parsed.type !== 'vertex'
    ) {
      setJsonError('type must be "openai", "gemini", or "vertex".');
      return;
    }
    setJsonError(null);
    const patch: Partial<Connection> = {};
    for (const k of EDITABLE_KEYS) {
      patch[k] = (parsed[k] as never) ?? undefined;
    }
    void updateConnection(conn.id, patch);
  };

  const detect = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      setPicker(await detectModels(conn));
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  };

  const addModel = () => {
    const id = newModel.trim();
    if (!id || conn.models.some((m) => m.id === id)) return;
    setModels([...conn.models, toSavedModel(id, conn.type)]);
    setNewModel('');
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete connection?',
      description: `"${conn.name}" and its saved models will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await deleteConnection(conn.id);
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="min-w-0 truncate text-sm font-medium">{conn.name}</span>
          {isDefault && (
            <Star className="size-3 shrink-0 fill-primary text-primary" />
          )}
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {TYPE_LABEL[conn.type]}
          </span>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-2.5 py-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Connection (JSON)</label>
              <Button variant="secondary" size="sm" onClick={saveJson}>
                Save
              </Button>
            </div>
            <textarea
              value={json}
              spellCheck={false}
              onChange={(e) => setJson(e.target.value)}
              onBlur={saveJson}
              rows={Math.min(10, json.split('\n').length + 1)}
              className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            {conn.type === 'vertex' && (
              <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                Vertex auth uses a service-account JSON on the server
                (<code>GOOGLE_VERTEX_CREDENTIALS</code>) — set <code>project</code>
                and <code>region</code> here.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">
                Models ({conn.models.length})
              </label>
              {conn.type !== 'vertex' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={detecting}
                  onClick={() => void detect()}
                >
                  <RefreshCw className={cn('size-3.5', detecting && 'animate-spin')} />
                  Detect
                </Button>
              )}
            </div>
            {detectError && (
              <p className="text-xs text-destructive">{detectError}</p>
            )}
            <div className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
              {conn.models.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No models. Detect or add one below.
                </p>
              )}
              {conn.models.map((m) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  onChange={(caps) =>
                    setModels(
                      conn.models.map((x) =>
                        x.id === m.id ? { ...x, capabilities: caps } : x,
                      ),
                    )
                  }
                  onRemove={() =>
                    setModels(conn.models.filter((x) => x.id !== m.id))
                  }
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newModel}
                spellCheck={false}
                placeholder="Add model id…"
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addModel();
                  }
                }}
              />
              <Button variant="secondary" size="sm" onClick={addModel}>
                Add
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={isDefault}
              onClick={() => void updateAppConfig({ defaultConnectionId: conn.id })}
            >
              <Star className={cn('size-3.5', isDefault && 'fill-primary text-primary')} />
              {isDefault ? 'Default' : 'Set as default'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {picker && (
        <ModelPicker
          open={picker !== null}
          onOpenChange={(v) => !v && setPicker(null)}
          available={picker}
          saved={conn.models}
          onConfirm={(ids) => {
            const existing = new Map(conn.models.map((m) => [m.id, m]));
            setModels(ids.map((id) => existing.get(id) ?? toSavedModel(id, conn.type)));
          }}
        />
      )}
    </div>
  );
}

const CAPS: { key: keyof ModelCapabilities; letter: string; title: string }[] = [
  { key: 'vision', letter: 'V', title: 'Vision (images)' },
  { key: 'pdf', letter: 'P', title: 'PDF files' },
  { key: 'reasoning', letter: 'R', title: 'Reasoning / thinking' },
  { key: 'webSearch', letter: 'W', title: 'Web search' },
  { key: 'toolUse', letter: 'T', title: 'Tool use' },
];

function ModelRow({
  model,
  onChange,
  onRemove,
}: {
  model: SavedModel;
  onChange: (caps: ModelCapabilities) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs" title={model.id}>
        {model.id}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {CAPS.map(({ key, letter, title }) => (
          <button
            key={key}
            type="button"
            title={title}
            onClick={() =>
              onChange({ ...model.capabilities, [key]: !model.capabilities[key] })
            }
            className={cn(
              'flex size-5 items-center justify-center rounded text-[10px] font-semibold transition-colors',
              model.capabilities[key]
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground/50 hover:text-muted-foreground',
            )}
          >
            {letter}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove model"
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
