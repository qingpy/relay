import type {
  Connection,
  ConnectionType,
  ModelCapabilities,
  SavedModel,
} from '@/db/types';

export type Flavor = 'openrouter' | 'openai' | 'vertex';

/** Distinguish OpenRouter (web plugin, `reasoning.effort`) from plain OpenAI. */
export function flavorOf(type: ConnectionType, baseUrl?: string): Flavor {
  if (type === 'vertex') return 'vertex';
  return baseUrl && /openrouter\.ai/i.test(baseUrl) ? 'openrouter' : 'openai';
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

/** Default base URLs for OpenAI-compatible flavors (none for Gemini/Vertex). */
export const DEFAULT_BASE_URL: Partial<Record<Flavor, string>> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
};

export function seedModelsFor(type: ConnectionType, baseUrl?: string): SavedModel[] {
  return SEED_MODELS[flavorOf(type, baseUrl)].map((id) => toSavedModel(id, type));
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
