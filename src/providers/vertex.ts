import type { BuildInput, Delta, Provider, ProxyRequest } from './types';
import { geminiPayload, parseGeminiChunk } from './gemini';

/**
 * Google Cloud Vertex AI — Gemini models with the same request body as AI
 * Studio, but a different endpoint and OAuth (service-account) auth. The proxy
 * mints the token from the service-account private key it holds in its secret
 * store (resolved by connectionId); the client sends only non-secret config
 * (connectionId, project, region, client email, model, payload).
 */
export class VertexProvider implements Provider {
  readonly type = 'vertex' as const;

  buildRequest({
    model,
    messages,
    settings,
    connectionId,
    project,
    region,
    clientEmail,
    privateKey,
  }: BuildInput): ProxyRequest {
    return {
      url: '/api/chat/vertex',
      headers: { 'content-type': 'application/json' },
      body: {
        connectionId,
        project,
        region: region || 'us-central1',
        clientEmail,
        // Transient private key for testing an unsaved connection only; normal
        // chats omit it and the proxy reads it from the secret store by id.
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
