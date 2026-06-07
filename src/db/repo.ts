import {
  db,
  DEFAULT_TRASH_RETENTION_DAYS,
  ensureDefaultConnection,
  getAppConfig,
  newId,
} from './db';
import type {
  Connection,
  ConnectionType,
  Folder,
  Message,
  MessageRole,
  Part,
  Prompt,
  SavedModel,
  Session,
  StoredFile,
} from './types';
import { DEFAULT_URL, flavorOf } from '@/lib/models';
import { sha256Hex } from '@/lib/attachments';

export const NEW_SESSION_TITLE = 'New chat';

export async function createSession(input: {
  title?: string;
  folderId?: string | null;
}): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: newId(),
    folderId: input.folderId ?? null,
    title: input.title ?? NEW_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    // Negative so ascending `order` sort places new chats at the top; manual
    // reordering renumbers to small positive indices.
    order: -now,
  };
  await db.sessions.add(session);
  return session;
}

/** Live (non-trashed) sessions, ascending by `order` (newest first until reordered). */
export async function listSessions(): Promise<Session[]> {
  const all = await db.sessions.orderBy('order').toArray();
  return all.filter((s) => s.deletedAt == null);
}

/** Trashed sessions, most-recently-deleted first. */
export async function listTrashedSessions(): Promise<Session[]> {
  const trashed = await db.sessions.filter((s) => s.deletedAt != null).toArray();
  return trashed.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<Session, 'id'>>,
): Promise<void> {
  await db.sessions.update(id, { ...patch, updatedAt: Date.now() });
}

export async function touchSession(id: string): Promise<void> {
  await db.sessions.update(id, { updatedAt: Date.now() });
}

/** Update session fields without bumping `updatedAt` (won't reorder the list). */
export async function configureSession(
  id: string,
  patch: Partial<Omit<Session, 'id' | 'updatedAt'>>,
): Promise<void> {
  await db.sessions.update(id, patch);
}

/** Set this chat's extra system prompt (appended to its preset's). */
export async function setSessionSystemPrompt(
  id: string,
  systemPrompt: string | undefined,
): Promise<void> {
  await db.sessions.update(id, { systemPrompt: systemPrompt || undefined });
}

/** Move a chat to the trash: hidden from the sidebar, restorable until purged. */
export async function trashSession(id: string): Promise<void> {
  await db.sessions.update(id, { deletedAt: Date.now() });
}

/** Bring a chat back out of the trash. */
export async function restoreSession(id: string): Promise<void> {
  await db.sessions.update(id, { deletedAt: undefined });
}

/** Permanently remove a chat and its messages/files. Irreversible. */
export async function purgeSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.messages, db.files, async () => {
    await db.messages.where('sessionId').equals(id).delete();
    await db.files.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

/** Permanently remove every trashed chat. */
export async function emptyTrash(): Promise<void> {
  const trashed = await listTrashedSessions();
  for (const s of trashed) await purgeSession(s.id);
}

/** Purge trashed chats older than the configured retention (run on launch).
 *  A retention of 0 keeps them indefinitely. */
export async function purgeExpiredTrash(): Promise<void> {
  const { trashRetentionDays } = await getAppConfig();
  const days = trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;
  if (days <= 0) return;
  const cutoff = Date.now() - days * 86_400_000;
  const expired = (await listTrashedSessions()).filter(
    (s) => (s.deletedAt ?? 0) < cutoff,
  );
  for (const s of expired) await purgeSession(s.id);
}

export async function renameSession(id: string, title: string): Promise<void> {
  await configureSession(id, { title: title.trim() || NEW_SESSION_TITLE });
}

export async function moveSessionToFolder(
  id: string,
  folderId: string | null,
): Promise<void> {
  await configureSession(id, { folderId });
}

/** Persist a new placement/order for sessions (drag-drop). */
export async function persistSessionOrder(
  items: { id: string; order: number; folderId: string | null }[],
): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    for (const it of items) {
      await db.sessions.update(it.id, { order: it.order, folderId: it.folderId });
    }
  });
}

// --- Folders ---------------------------------------------------------------

/** All folders, ascending by `order`. */
export function listFolders(): Promise<Folder[]> {
  return db.folders.orderBy('order').toArray();
}

export function getFolder(id: string): Promise<Folder | undefined> {
  return db.folders.get(id);
}

/** Guarantee at least one preset exists and that no chat is loose; returns the
 *  preset to drop new top-level chats into. */
export async function ensureDefaultPreset(): Promise<string> {
  await ensureDefaultConnection();
  const folders = await listFolders();
  const preset = folders[0] ?? (await createFolder('General'));
  const loose = (await db.sessions.toArray()).filter((s) => !s.folderId);
  if (loose.length) {
    await db.transaction('rw', db.sessions, async () => {
      for (const s of loose) await db.sessions.update(s.id, { folderId: preset.id });
    });
  }
  return preset.id;
}

export async function createFolder(
  name = 'New preset',
  parentId: string | null = null,
): Promise<Folder> {
  // Seed the preset with the first enabled connection and its first model.
  const connections = await listConnections();
  const conn = connections.find((c) => c.enabled !== false) ?? connections[0];
  const folder: Folder = {
    id: newId(),
    name,
    parentId,
    order: -Date.now(),
    createdAt: Date.now(),
    connectionId: conn?.id ?? null,
    model: conn?.models[0]?.id ?? '',
    settings: {},
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || 'Untitled preset' });
}

/** Update a preset's model/connection/settings/system-prompt. */
export async function updateFolderConfig(
  id: string,
  patch: Partial<Pick<Folder, 'connectionId' | 'model' | 'settings' | 'systemPrompt'>>,
): Promise<void> {
  await db.folders.update(id, patch);
}

/** Delete a preset, moving its chats into another preset (chats are never
 *  loose). If it was the last preset, a fresh "General" preset is created. */
export async function deleteFolder(id: string): Promise<void> {
  const others = (await listFolders()).filter((f) => f.id !== id);
  let targetId = others[0]?.id ?? null;
  if (!targetId) targetId = (await createFolder('General')).id;
  await db.transaction('rw', db.folders, db.sessions, async () => {
    await db.sessions.where('folderId').equals(id).modify({ folderId: targetId });
    await db.folders.where('parentId').equals(id).modify({ parentId: null });
    await db.folders.delete(id);
  });
}

export async function persistFolderOrder(
  items: { id: string; order: number }[],
): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    for (const it of items) await db.folders.update(it.id, { order: it.order });
  });
}

// --- Connections -----------------------------------------------------------

const CONNECTION_TYPE_NAME: Record<ConnectionType, string> = {
  openai: 'New connection',
  vertex: 'Vertex AI',
};

export function listConnections(): Promise<Connection[]> {
  return db.connections.orderBy('order').toArray();
}

export function getConnection(id: string): Promise<Connection | undefined> {
  return db.connections.get(id);
}

export async function createConnection(input: {
  name?: string;
  type: ConnectionType;
  url?: string;
}): Promise<Connection> {
  const last = await db.connections.orderBy('order').last();
  const url = input.url ?? DEFAULT_URL[flavorOf(input.type, input.url)];
  const conn: Connection = {
    id: newId(),
    name: input.name?.trim() || CONNECTION_TYPE_NAME[input.type],
    type: input.type,
    url,
    models: [],
    enabled: true,
    order: (last?.order ?? -1) + 1,
    createdAt: Date.now(),
  };
  await db.connections.add(conn);
  return conn;
}

export async function updateConnection(
  id: string,
  patch: Partial<Omit<Connection, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.connections.update(id, patch);
}

export async function setConnectionModels(
  id: string,
  models: SavedModel[],
): Promise<void> {
  await db.connections.update(id, { models });
}

export async function deleteConnection(id: string): Promise<void> {
  await db.connections.delete(id);
}

export async function persistConnectionOrder(
  items: { id: string; order: number }[],
): Promise<void> {
  await db.transaction('rw', db.connections, async () => {
    for (const it of items) {
      await db.connections.update(it.id, { order: it.order });
    }
  });
}

// --- Quick prompts ---------------------------------------------------------

export function listPrompts(): Promise<Prompt[]> {
  return db.prompts.orderBy('order').toArray();
}

export async function createPrompt(
  input: { title?: string; content?: string } = {},
): Promise<Prompt> {
  const prompt: Prompt = {
    id: newId(),
    title: input.title ?? 'New prompt',
    content: input.content ?? '',
    order: Date.now(),
  };
  await db.prompts.add(prompt);
  return prompt;
}

export async function updatePrompt(
  id: string,
  patch: Partial<Omit<Prompt, 'id'>>,
): Promise<void> {
  await db.prompts.update(id, patch);
}

export async function deletePrompt(id: string): Promise<void> {
  await db.prompts.delete(id);
}

export function getMessages(sessionId: string): Promise<Message[]> {
  return db.messages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt');
}

export function getMessage(id: string): Promise<Message | undefined> {
  return db.messages.get(id);
}

export async function addMessage(input: {
  /** Caller-supplied id, for state that must exist before the row does
   *  (the chat store registers the stream buffer first). */
  id?: string;
  sessionId: string;
  parentId: string | null;
  role: MessageRole;
  content?: Part[];
  reasoning?: string;
}): Promise<Message> {
  const message: Message = {
    id: input.id ?? newId(),
    sessionId: input.sessionId,
    parentId: input.parentId,
    role: input.role,
    content: input.content ?? [],
    createdAt: Date.now(),
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
  };
  await db.messages.add(message);
  return message;
}

export async function updateMessage(
  id: string,
  patch: Partial<Omit<Message, 'id' | 'sessionId'>>,
): Promise<void> {
  await db.messages.update(id, patch);
}

export async function setCurrentLeaf(
  sessionId: string,
  leafId: string,
): Promise<void> {
  await db.sessions.update(sessionId, { currentLeafId: leafId });
}

/** Remove a single message, re-parenting its children to its parent so the rest
 *  of the branch (its replies) is preserved — used both to restore a divider and
 *  to delete one message without dropping everything below it. The message's own
 *  attachments are cleaned up. */
export async function spliceMessage(id: string): Promise<void> {
  const msg = await db.messages.get(id);
  if (!msg) return;
  await db.transaction('rw', db.sessions, db.messages, db.files, async () => {
    await db.messages
      .where('parentId')
      .equals(id)
      .modify({ parentId: msg.parentId });
    await db.messages.delete(id);
    await db.files.where('messageId').equals(id).delete();
    const session = await db.sessions.get(msg.sessionId);
    if (session?.currentLeafId === id) {
      await db.sessions.update(msg.sessionId, {
        currentLeafId: msg.parentId ?? undefined,
      });
    }
  });
}

/** Insert a context divider under the active tip and follow it. Messages before
 *  the divider stay on the page but leave the model context (ARCHITECTURE.md §3). */
export async function clearContext(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  const divider = await addMessage({
    sessionId,
    parentId: session?.currentLeafId ?? null,
    role: 'divider',
  });
  await db.sessions.update(sessionId, { currentLeafId: divider.id });
}

/** Deep-clone a session (tree + files) into a new session. */
export async function duplicateSession(
  sessionId: string,
): Promise<Session | undefined> {
  const session = await getSession(sessionId);
  if (!session) return;
  const msgs = await getMessages(sessionId);
  const files = await db.files.where('sessionId').equals(sessionId).toArray();
  const now = Date.now();
  const newSessionId = newId();

  const msgMap = new Map(msgs.map((m) => [m.id, newId()]));
  const fileMap = new Map(files.map((f) => [f.id, newId()]));

  const newSession: Session = {
    ...session,
    id: newSessionId,
    title: `Copy of ${session.title}`,
    createdAt: now,
    updatedAt: now,
    order: -now,
    currentLeafId: session.currentLeafId
      ? msgMap.get(session.currentLeafId)
      : undefined,
  };
  const newMsgs: Message[] = msgs.map((m) => ({
    ...m,
    id: msgMap.get(m.id)!,
    sessionId: newSessionId,
    parentId: m.parentId ? (msgMap.get(m.parentId) ?? null) : null,
    attachments: m.attachments
      ?.map((fid) => fileMap.get(fid))
      .filter((x): x is string => !!x),
  }));
  const newFiles: StoredFile[] = files.map((f) => ({
    ...f,
    id: fileMap.get(f.id)!,
    sessionId: newSessionId,
    messageId: f.messageId ? (msgMap.get(f.messageId) ?? null) : null,
  }));

  await db.transaction('rw', db.sessions, db.messages, db.files, async () => {
    await db.sessions.add(newSession);
    await db.messages.bulkAdd(newMsgs);
    await db.files.bulkAdd(newFiles);
  });
  return newSession;
}

export function textPart(text: string): Part {
  return { type: 'text', text };
}

// --- Files / attachments ---------------------------------------------------

/** Store uploaded files as blobs linked to a message; returns their ids.
 *
 *  The bytes are copied OUT of the picked `File` here, immediately: a `File`
 *  is a lazy reference to the source path, and reading it later (the request,
 *  every snapshot save) throws once the source is moved or deleted — which
 *  poisons every save from that moment on. Identical content (by SHA-256)
 *  reuses one in-memory Blob, and one copy in the snapshot. */
export async function saveAttachments(
  sessionId: string,
  messageId: string,
  files: File[],
): Promise<string[]> {
  // Read + hash before the transaction (a Dexie transaction doesn't survive
  // non-Dexie awaits).
  const incoming = await Promise.all(
    files.map(async (f) => {
      const bytes = await f.arrayBuffer();
      return {
        name: f.name,
        mimeType: f.type || 'application/octet-stream',
        bytes,
        hash: await sha256Hex(bytes),
      };
    }),
  );
  const ids: string[] = [];
  await db.transaction('rw', db.files, async () => {
    for (const f of incoming) {
      const id = newId();
      // Only rows that still own bytes may serve as a dedupe source —
      // a stripped placeholder shares the hash but holds an empty blob.
      const twin = await db.files
        .where('hash')
        .equals(f.hash)
        .filter((t) => !t.removedAt && !t.stripped)
        .first();
      await db.files.add({
        id,
        sessionId,
        messageId,
        name: f.name,
        mimeType: f.mimeType,
        size: f.bytes.byteLength,
        blob: twin?.blob ?? new Blob([f.bytes], { type: f.mimeType }),
        hash: f.hash,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
  });
  return ids;
}

export async function getFilesByIds(ids: string[]): Promise<StoredFile[]> {
  const res = await db.files.bulkGet(ids);
  return res.filter((f): f is StoredFile => !!f);
}

/** Delete stored files by id — attachments detached from a message by an edit. */
export async function deleteFiles(ids: string[]): Promise<void> {
  await db.files.bulkDelete(ids);
}

/** Strip stored files to tombstones: the bytes (and content hash) are dropped
 *  for good, but the rows stay attached to their messages, so the chat keeps a
 *  "removed" tag and the model is told the attachment is gone instead of having
 *  it silently vanish (see buildChatMessages). Irreversible. */
export async function removeFileContent(ids: string[]): Promise<void> {
  await db.transaction('rw', db.files, async () => {
    for (const id of ids) {
      const f = await db.files.get(id);
      if (!f || f.removedAt) continue;
      const { hash, stripped, ...rest } = f;
      await db.files.put({
        ...rest,
        blob: new Blob([], { type: f.mimeType }),
        removedAt: Date.now(),
      });
    }
  });
}
