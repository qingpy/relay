import { create } from 'zustand';
import { getAppConfig } from '@/db/db';
import {
  addMessage,
  getMessages,
  getSession,
  saveAttachments,
  textPart,
  updateMessage,
  updateSession,
} from '@/db/repo';
import type { Citation, ToolCall, Usage } from '@/db/types';
import { buildChatMessages, deriveTitle } from '@/lib/conversation';
import { readSSE } from '@/lib/sse';
import { getProvider } from '@/providers/registry';
import { NEW_SESSION_TITLE } from '@/db/repo';

export interface StreamBuffer {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
  citations: Citation[];
  reasoningMs?: number;
}

const EMPTY_BUFFER: StreamBuffer = {
  text: '',
  reasoning: '',
  toolCalls: [],
  citations: [],
};

interface ChatState {
  /** In-progress assistant output, keyed by assistant message id. */
  streams: Record<string, StreamBuffer>;
  /** sessionId -> streaming assistant message id (presence = streaming). */
  activeBySession: Record<string, string>;
  send: (sessionId: string, text: string, files?: File[]) => Promise<void>;
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

    send: async (sessionId, text, files) => {
      const trimmed = text.trim();
      if (!trimmed && !files?.length) return;
      if (get().activeBySession[sessionId]) return; // already streaming

      const session = await getSession(sessionId);
      if (!session) return;

      const config = await getAppConfig();
      const keyConfig = config.providerKeys[session.provider];

      // Persist the user turn (with any attachments); name the session.
      const userMsg = await addMessage({
        sessionId,
        role: 'user',
        content: [textPart(trimmed)],
      });
      if (files?.length) {
        const ids = await saveAttachments(sessionId, userMsg.id, files);
        await updateMessage(userMsg.id, { attachments: ids });
      }
      if (session.title === NEW_SESSION_TITLE) {
        await updateSession(sessionId, { title: deriveTitle(trimmed) });
      } else {
        await updateSession(sessionId, {});
      }

      const history = await getMessages(sessionId);
      const chatMessages = await buildChatMessages(history);

      const assistant = await addMessage({ sessionId, role: 'assistant' });
      const messageId = assistant.id;
      set((s) => ({
        streams: { ...s.streams, [messageId]: EMPTY_BUFFER },
        activeBySession: { ...s.activeBySession, [sessionId]: messageId },
      }));

      const controller = new AbortController();
      controllers.set(sessionId, controller);

      let buf: StreamBuffer = EMPTY_BUFFER;
      let usage: Usage | undefined;
      let lastPersist = 0;
      let errored: string | null = null;

      // Tool-call argument fragments, accumulated by index (OpenAI streams them
      // piecemeal); reasoning start time for the "thought for Ns" readout.
      const toolArgs: string[] = [];
      let reasoningStart = 0;

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
          ...(buf.reasoningMs != null ? { reasoningMs: buf.reasoningMs } : {}),
          ...(buf.toolCalls.length ? { toolCalls: buf.toolCalls } : {}),
          ...(buf.citations.length ? { citations: buf.citations } : {}),
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
            if (delta.kind === 'text') {
              if (reasoningStart && buf.reasoningMs == null) {
                buf = { ...buf, reasoningMs: Date.now() - reasoningStart };
              }
              buf = { ...buf, text: buf.text + delta.text };
            } else if (delta.kind === 'reasoning') {
              if (!reasoningStart) reasoningStart = Date.now();
              buf = { ...buf, reasoning: buf.reasoning + delta.text };
            } else if (delta.kind === 'toolCallDelta') {
              const calls = buf.toolCalls.slice();
              const cur = calls[delta.index] ?? {
                id: delta.id ?? `tool-${delta.index}`,
                name: '',
                args: '',
              };
              toolArgs[delta.index] =
                (toolArgs[delta.index] ?? '') + (delta.argsDelta ?? '');
              calls[delta.index] = {
                ...cur,
                ...(delta.id ? { id: delta.id } : {}),
                name: cur.name + (delta.name ?? ''),
                args: toolArgs[delta.index],
                pending: true,
              };
              buf = { ...buf, toolCalls: calls };
            } else if (delta.kind === 'toolCall') {
              buf = { ...buf, toolCalls: [...buf.toolCalls, delta.call] };
            } else if (delta.kind === 'citation') {
              const seen = new Set(buf.citations.map((c) => c.url));
              const fresh = delta.citations.filter((c) => !seen.has(c.url));
              if (fresh.length)
                buf = { ...buf, citations: [...buf.citations, ...fresh] };
            } else if (delta.kind === 'usage') usage = delta.usage;
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
        if (buf.toolCalls.some((c) => c.pending)) {
          buf = {
            ...buf,
            toolCalls: buf.toolCalls.map((c) => ({ ...c, pending: false })),
          };
        }
        await persist(true);
        if (errored) await updateMessage(messageId, { error: errored });
        controllers.delete(sessionId);
        clearStream(sessionId, messageId);
      }
    },
  };
});
