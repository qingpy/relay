import type { BuildInput, Delta, Provider, ProxyRequest } from './types';
import { geminiPayload, parseGeminiChunk } from './gemini';

/**
 * Google Cloud Vertex AI — Gemini models with the same request body as AI
 * Studio, but a different endpoint and OAuth (service-account) auth. The proxy
 * mints the token from a server-side service-account JSON; the client only
 * sends the project, region, model, and payload.
 */
export class VertexProvider implements Provider {
  readonly type = 'vertex' as const;

  buildRequest({
    model,
    messages,
    settings,
    project,
    region,
    clientEmail,
    privateKey,
  }: BuildInput): ProxyRequest {
    return {
      url: '/api/chat/vertex',
      headers: { 'content-type': 'application/json' },
      body: {
        project,
        region: region || 'us-central1',
        clientEmail,
        privateKey,
        model,
        payload: geminiPayload({ messages, settings }),
      },
    };
  }

  parseStreamChunk(data: string): Delta[] {
    return parseGeminiChunk(data);
  }
}
