import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Shared helpers for the proxy routes: JSON responses, upstream-URL
 *  validation, and durable file writes. */

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** Validate a user-supplied upstream URL — used verbatim, so only the protocol
 *  is checked (and it must parse as a URL). */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return raw;
  } catch {
    return null;
  }
}

const RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE']);
const RETRY_DELAYS_MS = [50, 100, 200, 400, 800];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a file op, retrying the transient lock/permission errors Windows throws
 *  when a read or rename collides with an AV scan or another open handle. */
export async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await op();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || i >= RETRY_DELAYS_MS.length) throw e;
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
}

// Writes to the same file are chained so concurrent requests can't interleave,
// and each write gets its own temp name — a fixed `.tmp` would let two writers
// tear each other's bytes before the rename.
const writeQueues = new Map<string, Promise<unknown>>();
let tmpSeq = 0;

/** Atomically replace `file` with `body`: unique temp file + rename, serialized
 *  per target path. A crash mid-write can never leave a half-written file. */
export function atomicWrite(file: string, body: string): Promise<void> {
  const tail = writeQueues.get(file) ?? Promise.resolve();
  const run = tail.then(async () => {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${++tmpSeq}.tmp`;
    await withRetry(() => writeFile(tmp, body, 'utf-8'));
    await withRetry(() => rename(tmp, file));
  });
  writeQueues.set(
    file,
    run.catch(() => undefined),
  );
  return run;
}
