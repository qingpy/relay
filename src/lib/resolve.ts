import type {
  AppConfig,
  Connection,
  Folder,
  ModelCapabilities,
  ProviderSettings,
  Session,
} from '@/db/types';
import { findModel } from '@/lib/models';

export interface ResolvedConfig {
  connection?: Connection;
  model: string;
  /** Effective settings for the provider (preset knobs + system prompt + web search). */
  settings: ProviderSettings;
  capabilities: ModelCapabilities;
}

const NO_CAPS: ModelCapabilities = {
  vision: false,
  pdf: false,
  reasoning: false,
  webSearch: false,
  toolUse: false,
};

const hasPresetConfig = (f?: Folder): boolean =>
  !!f && (f.connectionId != null || !!f.model);

/**
 * Resolve the connection, model, settings, and capabilities for a chat. A chat
 * in a preset uses the preset's connection/model/knobs and prepends the preset's
 * system prompt; a loose chat uses the default connection's first model. The
 * chat always contributes its own extra system prompt and web-search toggle.
 */
export function resolveConfig(
  session: Session | undefined,
  folder: Folder | undefined,
  connections: Connection[],
  config: AppConfig,
): ResolvedConfig {
  const byId = new Map(connections.map((c) => [c.id, c]));

  let connection: Connection | undefined;
  let model = '';
  let knobs: ProviderSettings = {};
  let baseSystemPrompt: string | undefined;

  if (hasPresetConfig(folder)) {
    connection = folder!.connectionId ? byId.get(folder!.connectionId) : undefined;
    model = folder!.model ?? '';
    knobs = { ...(folder!.settings ?? {}) };
    baseSystemPrompt = folder!.systemPrompt;
  }

  if (!connection) {
    connection =
      (config.defaultConnectionId && byId.get(config.defaultConnectionId)) ||
      connections[0];
    if (!model) model = connection?.models[0]?.id ?? '';
  }

  const systemPrompt =
    [baseSystemPrompt, session?.systemPrompt]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s)
      .join('\n\n') || undefined;

  const settings: ProviderSettings = {
    ...knobs,
    systemPrompt,
    webSearch: session?.webSearch ?? false,
  };

  const capabilities =
    connection && model ? findModel(connection, model).capabilities : NO_CAPS;

  return { connection, model, settings, capabilities };
}
