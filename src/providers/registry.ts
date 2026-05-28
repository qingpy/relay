import type { ProviderId } from '@/db/types';
import { GeminiProvider } from './gemini';
import { OpenAICompatProvider } from './openai';
import type { Capabilities, Provider } from './types';

const FULL: Capabilities = {
  vision: true,
  pdf: true,
  reasoning: true,
  webSearch: true,
  toolUse: true,
};

const OPENAI_DIRECT: Capabilities = { ...FULL, pdf: false };

/** Registered providers. `undefined` = planned but not yet implemented. */
const PROVIDERS: Record<ProviderId, Provider | undefined> = {
  openrouter: new OpenAICompatProvider(
    'openrouter',
    'OpenRouter',
    'https://openrouter.ai/api/v1',
    FULL,
  ),
  openai: new OpenAICompatProvider(
    'openai',
    'OpenAI',
    'https://api.openai.com/v1',
    OPENAI_DIRECT,
  ),
  gemini: new GeminiProvider('gemini', 'Gemini', FULL),
  vertex: undefined,
};

export function getProvider(id: ProviderId): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Provider "${id}" is not available yet.`);
  return p;
}

export function listProviders(): Provider[] {
  return Object.values(PROVIDERS).filter((p): p is Provider => p != null);
}

/** Curated fallback model lists for the picker (live fetch comes later). */
export const MODEL_SUGGESTIONS: Partial<Record<ProviderId, string[]>> = {
  openrouter: [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-haiku',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
};
