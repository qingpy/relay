import { create } from 'zustand';
import {
  addMessage,
  getFolder,
  getMessage,
  getMessages,
  getSession,
  listConnections,
  saveAttachments,
  setCurrentLeaf,
  spliceMessage,
  textPart,
  touchSession,
  updateMessage,
  updateSession,
} from '@/db/repo';
import type { Citation, Message, Session, ToolCall, Usage } from '@/db/types';
import {
  activeWindow,
  buildChatMessages,
  deriveTitle,
  partsText,
} from '@/lib/conversation';
import { resolveConfig, type ResolvedConfig } from '@/lib/resolve';
import { activePath } from '@/lib/tree';
import { readSSE } from '@/lib/sse';
import { providerForConnection } from '@/providers/registry';
import { NEW_SESSION_TITLE } from '@/db/repo';
import { maybeAutoTitle } from '@/lib/autotitle';

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
  /** Send a new user turn under the active leaf and stream the reply. */
  send: (sessionId: string, text: string, files?: File[]) => Promise<void>;
  /** Answer a user turn: stream a fresh assistant child under it. If a reply
   *  already exists it becomes an alternate sibling branch; an in-flight
   *  stream in the chat is stopped first. */
  regenerate: (sessionId: string, userId: string) => Promise<void>;
  stop: (sessionId: string) => void;
}

const controllers = new Map<string, AbortController>();
const PERSIST_INTERVAL = 400;

/** Abort a stream after this long without a single byte from the provider — a
 *  hung request otherwise holds the session's streaming slot forever. */
const IDLE_TIMEOUT_MS = 120_000;

/**
 * Price a turn's attachments from the provider's real `promptTokens`: subtract
 * our text estimate of everything sent, then split the leftover input tokens
 * across the files that don't yet have a measured cost. Stored per message
 * (`fileTokens`) so the context meter can count files for real and still update
 * live as messages are added or removed. Idempotent — once a message is priced,
 * later turns skip it.
 */
async function captureFileTokens(
  history: Message[],
  systemPrompt: string | undefined,
  usage: Usage | undefined,
): Promise<void> {
  const prompt = usage?.promptTokens;
  if (prompt == null) return;
  let textLen = systemPrompt?.length ?? 0;
  const withFiles: Message[] = [];
  for (const m of activeWindow(history)) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    textLen += partsText(m.content).length;
    if (m.attachments?.length) withFiles.push(m);
  }
  const unmeasured = withFiles.filter((m) => m.fileTokens == null);
  if (unmeasured.length === 0) return;

  const known = withFiles.reduce((sum, m) => sum + (m.fileTokens ?? 0), 0);
  const overhead = Math.max(0, prompt - Math.ceil(textLen / 4) - known);
  const newFiles = unmeasured.reduce((sum, m) => sum + (m.attachments?.length ?? 0), 0);
  if (newFiles === 0) return;
  for (const m of unmeasured) {
    const share = Math.round((overhead * (m.attachments?.length ?? 0)) / newFiles);
    await updateMessage(m.id, { fileTokens: share });
  }
}

export const useChatStore = create<ChatState>((set, get, api) => {
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

  /**
   * Create an assistant message under `parentId`, make it the active leaf, and
   * stream the provider response into it. `history` is the conversation path
   * (root → parent) used to build the request.
   *
   * The assistant message is created *before* any fallible work (config
   * resolution, attachment loading, the request itself) so every failure has a
   * visible home: an error on that message, with Retry — never a silent no-op.
   */
  const runTurn = async (
    session: Session,
    parentId: string,
    history: Message[],
  ) => {
    const sessionId = session.id;

    const assistant = await addMessage({ sessionId, parentId, role: 'assistant' });
    const messageId = assistant.id;
    await setCurrentLeaf(sessionId, messageId);
    set((s) => ({
      streams: { ...s.streams, [messageId]: EMPTY_BUFFER },
      activeBySession: { ...s.activeBySession, [sessionId]: messageId },
    }));

    const controller = new AbortController();
    controllers.set(sessionId, controller);

    let resolved: ResolvedConfig | undefined;
    let buf: StreamBuffer = EMPTY_BUFFER;
    let usage: Usage | undefined;
    let lastPersist = 0;
    let errored: string | null = null;

    // Watchdog: a provider that stops sending (or never starts) would hold the
    // session's streaming slot forever. Re-armed on every chunk; on expiry the
    // stream aborts with a visible, retryable error instead of hanging.
    let timedOut = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, IDLE_TIMEOUT_MS);
    };

    // Tool-call argument fragments, accumulated by index (OpenAI streams them
    // piecemeal); reasoning start time for the "thought for Ns" readout.
    const toolArgs: string[] = [];
    let reasoningStart = 0;

    // Coalesce visual updates to one per frame: re-parsing markdown on every
    // token is expensive and makes the stream stutter. Tokens still arrive at
    // full speed into `buf`; we just flush to the store at most once a frame.
    let flushQueued = false;
    let flushHandle = 0;
    const flush = () => {
      flushQueued = false;
      setBuffer(messageId, buf);
    };
    const scheduleFlush = () => {
      if (flushQueued) return;
      flushQueued = true;
      flushHandle = requestAnimationFrame(flush);
    };

    const persist = async (final: boolean) => {
      await updateMessage(messageId, {
        content: buf.text ? [textPart(buf.text)] : [],
        ...(resolved?.model ? { model: resolved.model } : {}),
        ...(buf.reasoning ? { reasoning: buf.reasoning } : {}),
        ...(buf.reasoningMs != null ? { reasoningMs: buf.reasoningMs } : {}),
        ...(buf.toolCalls.length ? { toolCalls: buf.toolCalls } : {}),
        ...(buf.citations.length ? { citations: buf.citations } : {}),
        ...(final && usage ? { usage } : {}),
      });
    };

    try {
      const folder = session.folderId
        ? await getFolder(session.folderId)
        : undefined;
      const connections = await listConnections();
      resolved = resolveConfig(session, folder, connections);
      const chatMessages = await buildChatMessages(history);

      if (!resolved.connection || !resolved.model) {
        throw new Error(
          'No model configured. Add a connection in Settings and pick a model for this chat or its preset.',
        );
      }
      const provider = providerForConnection(resolved.connection);
      const req = provider.buildRequest({
        model: resolved.model,
        messages: chatMessages,
        settings: resolved.settings,
        connectionId: resolved.connection.id,
        url: resolved.connection.url,
        project: resolved.connection.project,
        region: resolved.connection.region,
        clientEmail: resolved.connection.clientEmail,
      });

      armIdleTimer();
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
        armIdleTimer();
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
          void persist(false).catch(() => {});
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // A user Stop stays silent; the watchdog's own abort must not.
        if (timedOut) {
          errored = `No data from the provider for ${IDLE_TIMEOUT_MS / 1000}s — request aborted.`;
        }
      } else {
        errored = err instanceof Error ? err.message : String(err);
      }
    } finally {
      clearTimeout(idleTimer);
      if (buf.toolCalls.some((c) => c.pending)) {
        buf = {
          ...buf,
          toolCalls: buf.toolCalls.map((c) => ({ ...c, pending: false })),
        };
      }
      // Cancel any frame still queued so it can't re-insert (and resurrect) the
      // buffer after we clear it below — the final state is persisted to the DB.
      if (flushQueued) cancelAnimationFrame(flushHandle);

      const empty =
        !buf.text && !buf.reasoning && buf.toolCalls.length === 0;
      // A stream that ended clean but produced nothing is a failure the user
      // must see; one the user stopped before any output is just noise.
      if (empty && !errored && !controller.signal.aborted) {
        errored = 'The model returned no output.';
      }
      try {
        if (empty && !errored) {
          await spliceMessage(messageId); // stopped before output: drop the husk
        } else {
          await persist(true);
          await captureFileTokens(history, resolved?.settings.systemPrompt, usage);
          if (errored) await updateMessage(messageId, { error: errored });
        }
      } catch {
        // Persistence failed; still release the streaming slot below.
      }
      controllers.delete(sessionId);
      clearStream(sessionId, messageId);
    }
  };

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

      // User turn branches off the active leaf; show it immediately.
      const userMsg = await addMessage({
        sessionId,
        parentId: session.currentLeafId ?? null,
        role: 'user',
        content: [textPart(trimmed)],
      });
      if (files?.length) {
        const ids = await saveAttachments(sessionId, userMsg.id, files);
        await updateMessage(userMsg.id, { attachments: ids });
      }
      await setCurrentLeaf(sessionId, userMsg.id);
      if (session.title === NEW_SESSION_TITLE) {
        await updateSession(sessionId, { title: deriveTitle(trimmed) });
      } else {
        await updateSession(sessionId, {});
      }

      const history = activePath(await getMessages(sessionId), userMsg.id);
      await runTurn(session, userMsg.id, history);
      void maybeAutoTitle(sessionId);
    },

    regenerate: async (sessionId, userId) => {
      const session = await getSession(sessionId);
      if (!session) return;
      const user = await getMessage(userId);
      if (!user || user.role !== 'user') return;

      // A stream already running in this chat (even a hung one) doesn't block
      // regeneration — it means "abandon that, answer again": stop it and wait
      // for the slot to free (the turn's cleanup always releases it).
      if (get().activeBySession[sessionId]) {
        controllers.get(sessionId)?.abort();
        await new Promise<void>((resolve) => {
          if (!get().activeBySession[sessionId]) return resolve();
          const unsub = api.subscribe((s) => {
            if (!s.activeBySession[sessionId]) {
              unsub();
              resolve();
            }
          });
        });
      }

      await touchSession(sessionId);
      const history = activePath(await getMessages(sessionId), user.id);
      await runTurn(session, user.id, history);
    },
  };
});
