import { create } from 'zustand';
import { getAppConfig } from '@/db/db';
import {
  addMessage,
  getMessages,
  getSession,
  textPart,
  updateMessage,
  updateSession,
} from '@/db/repo';
import type { Usage } from '@/db/types';
import { deriveTitle, toChatMessages } from '@/lib/conversation';
import { readSSE } from '@/lib/sse';
import { getProvider } from '@/providers/registry';
import { NEW_SESSION_TITLE } from '@/db/repo';

interface StreamBuffer {
  text: string;
  reasoning: string;
}

interface ChatState {
  /** In-progress assistant output, keyed by assistant message id. */
  streams: Record<string, StreamBuffer>;
  /** sessionId -> streaming assistant message id (presence = streaming). */
  activeBySession: Record<string, string>;
  send: (sessionId: string, text: string) => Promise<void>;
  stop: (sessionId: string) => void;
}

const controllers = new Map<string, AbortController>();
const PERSIST_INTERVAL = 400;

export const useChatStore = create<ChatState>((set, get) => {
  const setBuffer = (id: string, buf: StreamBuffer) =>
    set((s) => ({ streams: { ...s.streams, [id]: buf } }));

  const clearStream = (sessionId: string, messageId: string) =>
    set((s) => {
      const streams = { ...s.streams };
      delete streams[messageId];
      const activeBySession = { ...s.activeBySession };
      delete activeBySession[sessionId];
      return { streams, activeBySession };
    });

  return {
    streams: {},
    activeBySession: {},

    stop: (sessionId) => controllers.get(sessionId)?.abort(),

    send: async (sessionId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (get().activeBySession[sessionId]) return; // already streaming

      const session = await getSession(sessionId);
      if (!session) return;

      const config = await getAppConfig();
      const keyConfig = config.providerKeys[session.provider];

      // Persist the user turn; name the session from the first message.
      await addMessage({
        sessionId,
        role: 'user',
        content: [textPart(trimmed)],
      });
      if (session.title === NEW_SESSION_TITLE) {
        await updateSession(sessionId, { title: deriveTitle(trimmed) });
      } else {
        await updateSession(sessionId, {});
      }

      const history = await getMessages(sessionId);
      const chatMessages = toChatMessages(history);

      const assistant = await addMessage({ sessionId, role: 'assistant' });
      const messageId = assistant.id;
      set((s) => ({
        streams: { ...s.streams, [messageId]: { text: '', reasoning: '' } },
        activeBySession: { ...s.activeBySession, [sessionId]: messageId },
      }));

      const controller = new AbortController();
      controllers.set(sessionId, controller);

      let buf: StreamBuffer = { text: '', reasoning: '' };
      let usage: Usage | undefined;
      let lastPersist = 0;
      let errored: string | null = null;

      // Coalesce visual updates to one per frame: re-parsing markdown on every
      // token is expensive and makes the stream stutter. Tokens still arrive at
      // full speed into `buf`; we just flush to the store at most once a frame.
      let flushQueued = false;
      const flush = () => {
        flushQueued = false;
        setBuffer(messageId, buf);
      };
      const scheduleFlush = () => {
        if (flushQueued) return;
        flushQueued = true;
        requestAnimationFrame(flush);
      };

      const persist = async (final: boolean) => {
        await updateMessage(messageId, {
          content: buf.text ? [textPart(buf.text)] : [],
          ...(buf.reasoning ? { reasoning: buf.reasoning } : {}),
          ...(final && usage ? { usage } : {}),
        });
      };

      try {
        const provider = getProvider(session.provider);
        const req = provider.buildRequest({
          model: session.model,
          messages: chatMessages,
          settings: session.settings,
          apiKey: keyConfig?.apiKey,
          baseUrl: keyConfig?.baseUrl,
        });

        const res = await fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(req.body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res
            .json()
            .then((j: { error?: string }) => j.error)
            .catch(() => null);
          throw new Error(detail || `Request failed (${res.status})`);
        }

        for await (const data of readSSE(res.body, controller.signal)) {
          for (const delta of provider.parseStreamChunk(data)) {
            if (delta.kind === 'text') buf = { ...buf, text: buf.text + delta.text };
            else if (delta.kind === 'reasoning')
              buf = { ...buf, reasoning: buf.reasoning + delta.text };
            else if (delta.kind === 'usage') usage = delta.usage;
            else if (delta.kind === 'error') errored = delta.message;
          }
          scheduleFlush();

          const now = Date.now();
          if (now - lastPersist > PERSIST_INTERVAL) {
            lastPersist = now;
            void persist(false);
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          errored = err instanceof Error ? err.message : String(err);
        }
      } finally {
        await persist(true);
        if (errored) await updateMessage(messageId, { error: errored });
        controllers.delete(sessionId);
        clearStream(sessionId, messageId);
      }
    },
  };
});
