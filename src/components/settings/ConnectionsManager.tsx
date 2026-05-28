import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { testConnection, type TestResult } from '@/lib/connTest';
import { detectModels } from '@/lib/detect';
import { toSavedModel } from '@/lib/models';
import { cn } from '@/lib/utils';
import { ModelPicker } from './ModelPicker';

const labelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

const TYPE_LABEL: Record<ConnectionType, string> = {
  openai: 'Custom',
  vertex: 'Vertex AI',
};

export function ConnectionsManager() {
  const connections = useLiveQuery(() => listConnections(), [], []);
  const [openId, setOpenId] = useState<string | null>(null);

  const add = async () => {
    const c = await createConnection({ type: 'openai' });
    setOpenId(c.id);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className={labelClass}>Connections</h3>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => void add()}>
          <Plus className="size-3.5" />
          Add
        </Button>
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
            open={openId === c.id}
            onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectionCard({
  conn,
  open,
  onToggle,
}: {
  conn: Connection;
  open: boolean;
  onToggle: () => void;
}) {
  const enabled = conn.enabled !== false;
  return (
    <div className={cn('rounded-lg border border-border', !enabled && 'opacity-60')}>
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
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {TYPE_LABEL[conn.type]}
          </span>
        </button>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void updateConnection(conn.id, { enabled: v })}
          title={enabled ? 'On — models available' : 'Off — hidden from pickers'}
        />
      </div>

      {open && <Editor conn={conn} />}
    </div>
  );
}

function Editor({ conn }: { conn: Connection }) {
  const [name, setName] = useState(conn.name);
  const [type, setType] = useState<ConnectionType>(conn.type);
  const [baseUrl, setBaseUrl] = useState(conn.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(conn.apiKey ?? '');
  const [project, setProject] = useState(conn.project ?? '');
  const [region, setRegion] = useState(conn.region ?? '');
  const [clientEmail, setClientEmail] = useState(conn.clientEmail ?? '');
  const [privateKey, setPrivateKey] = useState(conn.privateKey ?? '');
  const [newModel, setNewModel] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [picker, setPicker] = useState<string[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [testModel, setTestModel] = useState('');
  const [testResult, setTestResult] = useState<(TestResult & { model: string }) | null>(null);
  const saInput = useRef<HTMLInputElement>(null);

  const testModelId =
    testModel && conn.models.some((m) => m.id === testModel)
      ? testModel
      : conn.models[0]?.id ?? '';

  const runTest = async () => {
    if (!testModelId) {
      setTestResult({ ok: false, error: 'Add a model first.', model: '' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const r = await testConnection(conn, testModelId);
    setTestResult({ ...r, model: testModelId });
    setTesting(false);
  };

  const uploadServiceAccount = async (file: File) => {
    try {
      const sa = JSON.parse(await file.text()) as {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };
      const patch = {
        clientEmail: sa.client_email ?? clientEmail,
        privateKey: sa.private_key ?? privateKey,
        project: sa.project_id ?? project,
      };
      setClientEmail(patch.clientEmail);
      setPrivateKey(patch.privateKey);
      setProject(patch.project);
      void updateConnection(conn.id, patch);
    } catch {
      // Ignore invalid JSON; the user can paste fields manually.
    }
  };

  const setModels = (models: SavedModel[]) =>
    void setConnectionModels(conn.id, models);

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
    <div className="flex flex-col gap-3 border-t border-border px-2.5 py-3">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            void updateConnection(conn.id, { name: e.target.value });
          }}
        />
      </Field>

      <Field label="Type">
        <select
          value={type}
          onChange={(e) => {
            const t = e.target.value as ConnectionType;
            setType(t);
            void updateConnection(conn.id, { type: t });
          }}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="openai">Custom (OpenAI-style API)</option>
          <option value="vertex">Vertex AI</option>
        </select>
      </Field>

      {type === 'openai' ? (
        <>
          <Field label="Base URL">
            <Input
              spellCheck={false}
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                void updateConnection(conn.id, { baseUrl: e.target.value });
              }}
            />
          </Field>
          <Field label="API key">
            <Input
              type="password"
              autoComplete="off"
              placeholder="API key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                void updateConnection(conn.id, { apiKey: e.target.value });
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Paste fields or load the service-account JSON.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => saInput.current?.click()}
            >
              Upload JSON
            </Button>
            <input
              ref={saInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadServiceAccount(f);
              }}
            />
          </div>
          <Field label="GCP project id">
            <Input
              spellCheck={false}
              placeholder="my-project-123"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                void updateConnection(conn.id, { project: e.target.value });
              }}
            />
          </Field>
          <Field label="Region">
            <Input
              spellCheck={false}
              placeholder="us-central1"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                void updateConnection(conn.id, { region: e.target.value });
              }}
            />
          </Field>
          <Field label="Client email">
            <Input
              spellCheck={false}
              placeholder="name@project.iam.gserviceaccount.com"
              value={clientEmail}
              onChange={(e) => {
                setClientEmail(e.target.value);
                void updateConnection(conn.id, { clientEmail: e.target.value });
              }}
            />
          </Field>
          <Field label="Private key">
            <textarea
              spellCheck={false}
              placeholder="-----BEGIN PRIVATE KEY-----…"
              value={privateKey}
              onChange={(e) => {
                setPrivateKey(e.target.value);
                void updateConnection(conn.id, { privateKey: e.target.value });
              }}
              rows={3}
              className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
            Stored in this browser and sent to the local proxy to mint a token.
            Leave the key blank to use a server-side
            <code> GOOGLE_VERTEX_CREDENTIALS</code> JSON instead.
          </p>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Models ({conn.models.length})</label>
          {type !== 'vertex' && (
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
        {detectError && <p className="text-xs text-destructive">{detectError}</p>}
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
              onRemove={() => setModels(conn.models.filter((x) => x.id !== m.id))}
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

      <div className="flex items-center gap-2 pt-1">
        {conn.models.length > 0 && (
          <select
            value={testModelId}
            onChange={(e) => setTestModel(e.target.value)}
            className="h-8 max-w-36 rounded-md border border-input bg-transparent pl-2 pr-6 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Model to test"
          >
            {conn.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={testing}
          onClick={() => void runTest()}
        >
          {testing ? 'Testing…' : 'Test'}
        </Button>
        {testResult && (
          <span
            className={cn(
              'min-w-0 truncate text-xs',
              testResult.ok ? 'text-primary' : 'text-destructive',
            )}
            title={testResult.error || testResult.text}
          >
            {testResult.ok
              ? `✓ ${testResult.model} · ${testResult.ms}ms`
              : `✗ ${testResult.error}`}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-destructive hover:text-destructive"
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
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
