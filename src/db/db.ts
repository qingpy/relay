import Dexie, { type EntityTable } from 'dexie';
import type {
  AppConfig,
  Folder,
  Message,
  Prompt,
  Session,
  StoredFile,
} from './types.ts';

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
  }
}

export const db = new RelayDB();

export const APP_CONFIG_ID = 'singleton' as const;

export const DEFAULT_APP_CONFIG: AppConfig = {
  id: APP_CONFIG_ID,
  providerKeys: {},
  theme: 'system',
  defaultProvider: 'openrouter',
  defaultModel: 'openai/gpt-4o-mini',
};

/** Read the singleton config, creating it with defaults on first run. */
export async function getAppConfig(): Promise<AppConfig> {
  const existing = await db.appConfig.get(APP_CONFIG_ID);
  if (existing) return existing;
  await db.appConfig.put(DEFAULT_APP_CONFIG);
  return DEFAULT_APP_CONFIG;
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

export function newId(): string {
  return crypto.randomUUID();
}
