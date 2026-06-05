import Dexie, { type EntityTable, type Transaction } from 'dexie';
import {
  IDBFactory as FakeIDBFactory,
  IDBKeyRange as FakeIDBKeyRange,
} from 'fake-indexeddb';
import type {
  AppConfig,
  Connection,
  Folder,
  Message,
  Prompt,
  Session,
  StoredFile,
} from './types.ts';
import { DEFAULT_URL, seedModelsFor } from '@/lib/models';
import type { ConnectionType } from './types.ts';

/**
 * Relay's store (ARCHITECTURE.md §4 "Storage & sync"). The browser keeps the data only
 * in an **in-memory IndexedDB** — nothing persists to the browser profile / C:.
 * The durable copy is a single snapshot file owned by the proxy (`/api/data`,
 * see `src/lib/localstore.ts`), loaded into this DB on boot and written back on
 * change. Set `USE_LOCAL_STORE = false` to fall back to the browser's
 * persistent IndexedDB (the pre-M9 behaviour).
 *
 * Indexes list only the fields we query/sort on — not every property.
 */
export const USE_LOCAL_STORE = true;

type DexieOptions = ConstructorParameters<typeof Dexie>[1];

// One in-memory IndexedDB factory, shared by the app DB. Created once so the
// whole app talks to the same off-disk store.
const memoryBackend: DexieOptions | undefined = USE_LOCAL_STORE
  ? { indexedDB: new FakeIDBFactory(), IDBKeyRange: FakeIDBKeyRange }
  : undefined;

export class RelayDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  prompts!: EntityTable<Prompt, 'id'>;
  connections!: EntityTable<Connection, 'id'>;
  appConfig!: EntityTable<AppConfig, 'id'>;

  constructor(options?: DexieOptions) {
    super('relay', options);
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
    // v4: presets-only. Every chat lives in a preset — create a default one and
    // adopt any loose (folder-less) chats into it.
    this.version(4).upgrade(async (tx) => {
      await migrateToPresets(tx);
    });
    // v5: collapse connection types to openai|vertex. Convert Gemini AI Studio
    // connections to the OpenAI-compatible Google endpoint.
    this.version(5).upgrade(async (tx) => {
      const conns = (await tx.table('connections').toArray()) as (Connection & {
        baseUrl?: string;
      })[];
      for (const c of conns) {
        if ((c.type as string) === 'gemini') {
          await tx.table('connections').update(c.id, {
            type: 'openai',
            url: c.url || c.baseUrl || GOOGLE_OPENAI_URL,
          });
        }
      }
    });
    // v6: content hash on files — identical attachments share one stored copy
    // (rows missing a hash are backfilled on import; see backup.ts).
    this.version(6).stores({
      files: 'id, sessionId, messageId, hash',
    });
  }
}

const GOOGLE_OPENAI_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const PROVIDER_META: Record<
  string,
  { name: string; type: ConnectionType; url?: string }
> = {
  openrouter: { name: 'OpenRouter', type: 'openai', url: DEFAULT_URL.openrouter },
  openai: { name: 'OpenAI', type: 'openai', url: DEFAULT_URL.openai },
  gemini: { name: 'Gemini', type: 'openai', url: GOOGLE_OPENAI_URL },
};

/** v3 upgrade: build connections from old provider keys; seed preset/chat config. */
async function migrateToConnections(tx: Transaction): Promise<void> {
  const cfg = ((await tx.table('appConfig').get('singleton')) ?? {}) as {
    providerKeys?: Record<string, { apiKey?: string; baseUrl?: string }>;
    defaultProvider?: string;
    defaultModel?: string;
  };
  const keys = cfg.providerKeys ?? {};

  // Create a connection for every provider that had a key, plus the previous
  // default provider even if unkeyed; if none, seed a blank OpenRouter one.
  const wanted = new Set<string>();
  for (const [id, k] of Object.entries(keys)) if (k?.apiKey) wanted.add(id);
  if (cfg.defaultProvider) wanted.add(cfg.defaultProvider);
  if (wanted.size === 0) wanted.add('openrouter');

  let order = 0;
  let seedConnectionId: string | undefined;
  const providers = Object.keys(PROVIDER_META).filter((p) => wanted.has(p));
  for (const provider of providers) {
    const meta = PROVIDER_META[provider];
    if (!meta) continue;
    const id = crypto.randomUUID();
    // Legacy provider keys stored a base URL; `normalizeConnection` upgrades it
    // to a full chat-completions URL when the data is imported.
    const url = keys[provider]?.baseUrl || meta.url;
    await tx.table('connections').add({
      id,
      name: meta.name,
      type: meta.type,
      url,
      apiKey: keys[provider]?.apiKey,
      models: seedModelsFor(meta.type, url),
      enabled: true,
      order: order++,
      createdAt: Date.now(),
    });
    if (provider === (cfg.defaultProvider ?? 'openrouter') || !seedConnectionId) {
      seedConnectionId = id;
    }
  }

  // Seed each preset (folder) with a connection + a sensible model.
  const seed = seedConnectionId
    ? ((await tx.table('connections').get(seedConnectionId)) as Connection | undefined)
    : undefined;
  const seedModel = cfg.defaultModel || seed?.models[0]?.id || '';
  const folders = (await tx.table('folders').toArray()) as Folder[];
  for (const f of folders) {
    if (f.connectionId === undefined) {
      await tx.table('folders').update(f.id, {
        connectionId: seedConnectionId ?? null,
        model: seedModel,
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

/** v4 upgrade: ensure a default preset and move loose chats into it. */
async function migrateToPresets(tx: Transaction): Promise<void> {
  const folders = (await tx.table('folders').toArray()) as Folder[];
  let presetId = folders[0]?.id;
  if (!presetId) {
    const conns = (await tx.table('connections').toArray()) as Connection[];
    const conn = conns.sort((a, b) => a.order - b.order)[0];
    presetId = crypto.randomUUID();
    await tx.table('folders').add({
      id: presetId,
      name: 'General',
      parentId: null,
      order: 0,
      createdAt: Date.now(),
      connectionId: conn?.id ?? null,
      model: conn?.models[0]?.id ?? '',
      settings: {},
    });
  }
  const sessions = (await tx.table('sessions').toArray()) as Session[];
  for (const s of sessions) {
    if (!s.folderId) await tx.table('sessions').update(s.id, { folderId: presetId });
  }
}

export const db = new RelayDB(memoryBackend);

/**
 * Open the browser's PERSISTENT `relay` IndexedDB (the pre-M9 on-disk store),
 * for the one-time migration into the local data file. Always the real browser
 * backend, regardless of `USE_LOCAL_STORE`.
 */
export function openPersistentRelayDB(): RelayDB {
  return new RelayDB(undefined);
}

export const APP_CONFIG_ID = 'singleton' as const;

export const DEFAULT_APP_CONFIG: AppConfig = {
  id: APP_CONFIG_ID,
  theme: 'system',
};

export const DEFAULT_TITLE_PROMPT =
  'Summarize this conversation as a short, specific title of at most 6 words. ' +
  'Reply with the title only — no quotes, no trailing punctuation.';

/** Starter reasoning-effort choices (user-editable; see AppConfig.reasoningEfforts). */
export const DEFAULT_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'];

/** Days a trashed chat is kept before auto-purge on launch (see
 *  AppConfig.trashRetentionDays). `0` disables auto-purge. */
export const DEFAULT_TRASH_RETENTION_DAYS = 10;

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

/** Ensure at least one connection exists so chats have a model to resolve to. */
export async function ensureDefaultConnection(): Promise<void> {
  const count = await db.connections.count();
  if (count > 0) return;
  await db.connections.add({
    id: crypto.randomUUID(),
    name: 'OpenRouter',
    type: 'openai',
    url: DEFAULT_URL.openrouter,
    models: [],
    enabled: true,
    order: 0,
    createdAt: Date.now(),
  });
}

export function newId(): string {
  return crypto.randomUUID();
}
