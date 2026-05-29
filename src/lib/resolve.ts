import type {
  Connection,
  Folder,
  ModelCapabilities,
  ProviderSettings,
  Session,
} from '@/db/types';
import { findModel, reasoningKind, sanitizeReasoning } from '@/lib/models';

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

const firstEnabled = (connections: Connection[]): Connection | undefined =>
  connections.find((c) => c.enabled !== false) ?? connections[0];

/**
 * Resolve the connection, model, settings, and capabilities for a chat. A chat
 * uses its preset's connection/model/knobs and prepends the preset's system
 * prompt; it always contributes its own extra system prompt + web-search toggle.
 * Falls back to the first enabled connection if the preset's is missing.
 */
export function resolveConfig(
  session: Session | undefined,
  folder: Folder | undefined,
  connections: Connection[],
): ResolvedConfig {
  const byId = new Map(connections.map((c) => [c.id, c]));

  let connection = folder?.connectionId ? byId.get(folder.connectionId) : undefined;
  let model = folder?.model ?? '';
  if (!connection) {
    connection = firstEnabled(connections);
    if (!model) model = connection?.models[0]?.id ?? '';
  }

  const systemPrompt =
    [folder?.systemPrompt, session?.systemPrompt]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s)
      .join('\n\n') || undefined;

  const capabilities =
    connection && model ? findModel(connection, model).capabilities : NO_CAPS;

  const kind = reasoningKind(capabilities);

  const settings: ProviderSettings = {
    ...sanitizeReasoning(folder?.settings ?? {}, kind),
    systemPrompt,
    webSearch: session?.webSearch ?? false,
  };

  return { connection, model, settings, capabilities };
}
