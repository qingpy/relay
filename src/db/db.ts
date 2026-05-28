import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type {
  AppConfig,
  Connection,
  Folder,
  Message,
  Prompt,
  Session,
  StoredFile,
} from './types.ts';
import { DEFAULT_BASE_URL, seedModelsFor } from '@/lib/models';
import type { ConnectionType } from './types.ts';

/**
 * Relay's local-first store. IndexedDB is the source of truth; the network is
 * only for LLM calls and optional WebDAV sync.
 *
 * Indexes list only the fields we query/sort on — not every property.
 */
class RelayDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  prompts!: EntityTable<Prompt, 'id'>;
  connections!: EntityTable<Connection, 'id'>;
  appConfig!: EntityTable<AppConfig, 'id'>;

  constructor() {
    super('relay');
    this.version(1).stores({
      folders: 'id, parentId, order',
      sessions: 'id, folderId, updatedAt, order',
      messages: 'id, sessionId, createdAt',
      files: 'id, sessionId, messageId',
      prompts: 'id, order',
      appConfig: 'id',
    });
    // v2: message tree (branching). Backfill parentId as a linear chain per
    // session (createdAt order) and point each session at its last message.
    this.version(2)
      .stores({
        messages: 'id, sessionId, parentId, createdAt',
      })
      .upgrade(async (tx) => {
        const sessions = await tx.table('sessions').toArray();
        for (const s of sessions) {
          const msgs = await tx
            .table('messages')
            .where('sessionId')
            .equals(s.id)
            .sortBy('createdAt');
          let prev: string | null = null;
          for (const m of msgs) {
            await tx.table('messages').update(m.id, { parentId: prev });
            prev = m.id;
          }
          if (prev) await tx.table('sessions').update(s.id, { currentLeafId: prev });
        }
      });
    // v3: connections + presets. Turn the fixed provider keys into named
    // connections, give folders (presets) a model/settings/system-prompt, and
    // move per-session model settings onto the preset / chat.
    this.version(3)
      .stores({
        connections: 'id, order',
      })
      .upgrade(async (tx) => {
        await migrateToConnections(tx);
      });
  }
}

const PROVIDER_META: Record<
  string,
  { name: string; type: ConnectionType; baseUrl?: string }
> = {
  openrouter: { name: 'OpenRouter', type: 'openai', baseUrl: DEFAULT_BASE_URL.openrouter },
  openai: { name: 'OpenAI', type: 'openai', baseUrl: DEFAULT_BASE_URL.openai },
  gemini: { name: 'Gemini', type: 'gemini' },
  vertex: { name: 'Vertex AI', type: 'vertex' },
};

/** v3 upgrade: build connections from old provider keys; seed preset/chat config. */
async function migrateToConnections(tx: Transaction): Promise<void> {
  const cfg = ((await tx.table('appConfig').get('singleton')) ?? {}) as {
    providerKeys?: Record<string, { apiKey?: string; baseUrl?: string }>;
    defaultProvider?: string;
    defaultModel?: string;
  };
  const keys = cfg.providerKeys ?? {};

  // Create a connection for every provider that had a key, plus the default
  // provider even if unkeyed; if none, seed a blank OpenRouter connection.
  const wanted = new Set<string>();
  for (const [id, k] of Object.entries(keys)) if (k?.apiKey) wanted.add(id);
  if (cfg.defaultProvider) wanted.add(cfg.defaultProvider);
  if (wanted.size === 0) wanted.add('openrouter');

  let order = 0;
  let defaultConnectionId: string | undefined;
  const providers = Object.keys(PROVIDER_META).filter((p) => wanted.has(p));
  for (const provider of providers) {
    const meta = PROVIDER_META[provider];
    if (!meta || meta.type === 'vertex') continue; // vertex needs server creds
    const id = crypto.randomUUID();
    const baseUrl = keys[provider]?.baseUrl || meta.baseUrl;
    await tx.table('connections').add({
      id,
      name: meta.name,
      type: meta.type,
      baseUrl,
      apiKey: keys[provider]?.apiKey,
      models: seedModelsFor(meta.type, baseUrl),
      order: order++,
      createdAt: Date.now(),
    });
    if (provider === (cfg.defaultProvider ?? 'openrouter') || !defaultConnectionId) {
      defaultConnectionId = id;
    }
  }

  await tx.table('appConfig').update('singleton', { defaultConnectionId });

  // Seed each preset (folder) with the default connection + a sensible model.
  const def = defaultConnectionId
    ? ((await tx.table('connections').get(defaultConnectionId)) as Connection | undefined)
    : undefined;
  const defModel = cfg.defaultModel || def?.models[0]?.id || '';
  const folders = (await tx.table('folders').toArray()) as Folder[];
  for (const f of folders) {
    if (f.connectionId === undefined) {
      await tx.table('folders').update(f.id, {
        connectionId: defaultConnectionId ?? null,
        model: defModel,
        settings: {},
      });
    }
  }

  // Move per-session model settings: keep webSearch + systemPrompt on the chat,
  // drop the now-preset-owned provider/model/settings.
  const sessions = (await tx.table('sessions').toArray()) as (Session & {
    settings?: { systemPrompt?: string; webSearch?: boolean };
    provider?: unknown;
    model?: unknown;
  })[];
  for (const s of sessions) {
    await tx.table('sessions').update(s.id, {
      systemPrompt: s.settings?.systemPrompt,
      webSearch: s.settings?.webSearch ?? false,
      provider: undefined,
      model: undefined,
      settings: undefined,
    });
  }
}

export const db = new RelayDB();

export const APP_CONFIG_ID = 'singleton' as const;

export const DEFAULT_APP_CONFIG: AppConfig = {
  id: APP_CONFIG_ID,
  theme: 'system',
};

export const DEFAULT_TITLE_PROMPT =
  'Summarize this conversation as a short, specific title of at most 6 words. ' +
  'Reply with the title only — no quotes, no trailing punctuation.';

/** Read the singleton config, creating it (and a starter connection) on first run. */
export async function getAppConfig(): Promise<AppConfig> {
  const existing = await db.appConfig.get(APP_CONFIG_ID);
  if (existing) return existing;
  const config = { ...DEFAULT_APP_CONFIG };
  await db.appConfig.put(config);
  return config;
}

/** Merge a patch into the singleton config. */
export async function updateAppConfig(
  patch: Partial<Omit<AppConfig, 'id'>>,
): Promise<AppConfig> {
  const current = await getAppConfig();
  const next = { ...current, ...patch, id: APP_CONFIG_ID };
  await db.appConfig.put(next);
  return next;
}

/** Ensure at least one connection exists; returns the default connection id. */
export async function ensureDefaultConnection(): Promise<string | undefined> {
  const count = await db.connections.count();
  if (count === 0) {
    const id = crypto.randomUUID();
    await db.connections.add({
      id,
      name: 'OpenRouter',
      type: 'openai',
      baseUrl: DEFAULT_BASE_URL.openrouter,
      models: seedModelsFor('openai', DEFAULT_BASE_URL.openrouter),
      order: 0,
      createdAt: Date.now(),
    });
    await updateAppConfig({ defaultConnectionId: id });
    return id;
  }
  const cfg = await getAppConfig();
  if (cfg.defaultConnectionId) return cfg.defaultConnectionId;
  const first = await db.connections.orderBy('order').first();
  if (first) await updateAppConfig({ defaultConnectionId: first.id });
  return first?.id;
}

export function newId(): string {
  return crypto.randomUUID();
}
