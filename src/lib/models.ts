import type {
  Connection,
  ConnectionType,
  ModelCapabilities,
  ModelSettings,
  SavedModel,
} from '@/db/types';

export type Flavor = 'openrouter' | 'openai' | 'vertex';

/** Distinguish OpenRouter (web plugin, `reasoning.effort`) from plain OpenAI. */
export function flavorOf(type: ConnectionType, url?: string): Flavor {
  if (type === 'vertex') return 'vertex';
  return url && /openrouter\.ai/i.test(url) ? 'openrouter' : 'openai';
}

/** Best-effort capability guess from a model id; users can correct it. */
export function inferCapabilities(
  id: string,
  type: ConnectionType,
): ModelCapabilities {
  const s = id.toLowerCase();
  const reasoning =
    /(^|[-_/ ])(o[1-4])([-_].|$)/.test(s) ||
    /(reason|think|qwq|deepseek-r|[-/]r1\b|grok-4|gpt-5)/.test(s) ||
    /gemini-2\.5/.test(s) ||
    /claude.*(opus-4|sonnet-4|3-7)/.test(s);
  const vision =
    /(4o|4\.1|gpt-4o|o3|o4|chatgpt|claude-3|claude-4|claude.*(opus|sonnet)|gemini|vision|[-/]vl\b|pixtral|llava|llama-3\.[2-9]|qwen.*vl|grok.*(vision|2|4)|multimodal)/.test(
      s,
    );
  const pdf =
    type === 'vertex' || /(claude|gemini)/.test(s) ? vision : false;
  const toolUse = !/(embed|whisper|tts|image|dall|moderation|rerank)/.test(s);
  return { vision, pdf, reasoning, webSearch: type !== 'openai', toolUse };
}

export function toSavedModel(id: string, type: ConnectionType): SavedModel {
  return { id, capabilities: inferCapabilities(id, type) };
}

/**
 * How a model exposes its "thinking" knob:
 * - `none`   — the model doesn't reason (or the capability is turned off).
 * - `effort` — an effort string the user picks. OpenAI-compatible models send it
 *   as `reasoning_effort`; Vertex/Gemini as `thinkingConfig.thinkingLevel`. The
 *   accepted set varies per model, so we don't constrain it.
 */
export type ReasoningKind = 'none' | 'effort';

/** Whether a model exposes the reasoning-effort knob — gated by the saved
 *  capability so a non-reasoning model shows no control. */
export function reasoningKind(caps: ModelCapabilities): ReasoningKind {
  return caps.reasoning ? 'effort' : 'none';
}

/**
 * Strip the reasoning effort when the resolved model can't use it, so a stale
 * value (left over after a model switch, a backup import, or a migration) is
 * never sent upstream.
 */
export function sanitizeReasoning(
  settings: ModelSettings,
  kind: ReasoningKind,
): ModelSettings {
  if (kind === 'effort') return settings;
  const out = { ...settings };
  delete out.reasoningEffort;
  return out;
}

/** Curated starter models per flavor (used when seeding a fresh connection). */
export const SEED_MODELS: Record<Flavor, string[]> = {
  openrouter: [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-haiku',
    'google/gemini-2.0-flash-001',
    'deepseek/deepseek-chat',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'o1'],
  vertex: ['gemini-2.0-flash', 'gemini-2.5-pro'],
};

/** Default endpoint URLs for OpenAI-compatible flavors (none for Vertex). The
 *  full chat-completions URL — the user can edit any part of it. */
export const DEFAULT_URL: Partial<Record<Flavor, string>> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
};

export function seedModelsFor(type: ConnectionType, url?: string): SavedModel[] {
  return SEED_MODELS[flavorOf(type, url)].map((id) => toSavedModel(id, type));
}

/**
 * Derive the model-listing URL from a chat-completions endpoint URL. OpenAI-
 * compatible APIs serve the catalog at `…/models` next to `…/chat/completions`,
 * so swap the suffix (preserving any query/hash). Returns null when the URL
 * doesn't follow that convention — then models are added by hand.
 */
export function modelsUrlFrom(url: string): string | null {
  const m = url.match(/\/chat\/completions\/?(\?[^#]*)?(#.*)?$/i);
  if (!m || m.index == null) return null;
  return `${url.slice(0, m.index)}/models${m[1] ?? ''}${m[2] ?? ''}`;
}

/**
 * Ensure an OpenAI-compatible connection's `url` is the full chat-completions
 * endpoint. Upgrades older records that stored a base URL — or the legacy
 * `baseUrl` field — by appending `/chat/completions`, and drops `baseUrl`.
 * Idempotent; runs on every data import (see `importAll`).
 */
export function normalizeConnection(
  conn: Connection & { baseUrl?: string },
): Connection {
  const { baseUrl, ...rest } = conn;
  if (rest.type !== 'openai') return rest;
  let url = rest.url ?? baseUrl;
  // Append the suffix only to a bare base URL — leave a complete endpoint
  // (with any query/hash, e.g. Azure's `?api-version=…`) untouched.
  if (url && !/\/chat\/completions\/?(\?[^#]*)?(#.*)?$/i.test(url)) {
    url = `${url.replace(/\/+$/, '')}/chat/completions`;
  }
  return { ...rest, url };
}

/** Find a model in a connection's catalog (or synthesize one if missing). */
export function findModel(conn: Connection, id: string): SavedModel {
  return conn.models.find((m) => m.id === id) ?? toSavedModel(id, conn.type);
}

const CHOICE_SEP = '␟';

/** Encode a (connection, model) pair for a single <select> value. */
export function encodeModelChoice(connectionId: string, model: string): string {
  return `${connectionId}${CHOICE_SEP}${model}`;
}

export function decodeModelChoice(value: string): {
  connectionId: string;
  model: string;
} {
  const i = value.indexOf(CHOICE_SEP);
  return i < 0
    ? { connectionId: '', model: value }
    : { connectionId: value.slice(0, i), model: value.slice(i + 1) };
}

/** Enabled connections that have at least one saved model. */
export function modelGroups(connections: Connection[]): Connection[] {
  return connections.filter((c) => c.enabled !== false && c.models.length > 0);
}
