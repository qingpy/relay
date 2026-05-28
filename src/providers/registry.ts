import type { Connection } from '@/db/types';
import { flavorOf } from '@/lib/models';
import { OpenAICompatProvider } from './openai';
import { VertexProvider } from './vertex';
import type { Provider } from './types';

/** Instantiate the right provider for a connection's protocol. */
export function providerForConnection(conn: Connection): Provider {
  if (conn.type === 'vertex') return new VertexProvider();
  return new OpenAICompatProvider(flavorOf(conn.type, conn.baseUrl) === 'openrouter');
}
