import type { Connection } from '@/db/types';
import { flavorOf } from '@/lib/models';
import { GeminiProvider } from './gemini';
import { OpenAICompatProvider } from './openai';
import { VertexProvider } from './vertex';
import type { Provider } from './types';

/** Instantiate the right provider for a connection's protocol. */
export function providerForConnection(conn: Connection): Provider {
  switch (conn.type) {
    case 'gemini':
      return new GeminiProvider();
    case 'vertex':
      return new VertexProvider();
    case 'openai':
    default:
      return new OpenAICompatProvider(flavorOf(conn.type, conn.baseUrl) === 'openrouter');
  }
}
