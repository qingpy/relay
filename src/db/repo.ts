import { db, newId } from './db';
import type {
  Folder,
  Message,
  MessageRole,
  Part,
  ProviderId,
  Session,
  SessionSettings,
} from './types';

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  webSearch: false,
};

export const NEW_SESSION_TITLE = 'New chat';

export async function createSession(input: {
  provider: ProviderId;
  model: string;
  title?: string;
  folderId?: string | null;
  settings?: Partial<SessionSettings>;
}): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: newId(),
    folderId: input.folderId ?? null,
    title: input.title ?? NEW_SESSION_TITLE,
    provider: input.provider,
    model: input.model,
    settings: { ...DEFAULT_SESSION_SETTINGS, ...input.settings },
    createdAt: now,
    updatedAt: now,
    // Negative so ascending `order` sort places new chats at the top; manual
    // reordering renumbers to small positive indices.
    order: -now,
  };
  await db.sessions.add(session);
  return session;
}

/** All sessions, ascending by `order` (newest first until reordered). */
export function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('order').toArray();
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

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.messages, db.files, async () => {
    await db.messages.where('sessionId').equals(id).delete();
    await db.files.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
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

export async function createFolder(
  name = 'New folder',
  parentId: string | null = null,
): Promise<Folder> {
  const folder: Folder = {
    id: newId(),
    name,
    parentId,
    order: -Date.now(),
    createdAt: Date.now(),
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || 'Untitled folder' });
}

/** Delete a folder, promoting its sessions and subfolders to the root. */
export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.sessions, async () => {
    await db.sessions
      .where('folderId')
      .equals(id)
      .modify({ folderId: null });
    await db.folders
      .where('parentId')
      .equals(id)
      .modify({ parentId: null });
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

export function getMessages(sessionId: string): Promise<Message[]> {
  return db.messages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt');
}

export async function addMessage(input: {
  sessionId: string;
  role: MessageRole;
  content?: Part[];
  reasoning?: string;
}): Promise<Message> {
  const message: Message = {
    id: newId(),
    sessionId: input.sessionId,
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

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id);
}

export function textPart(text: string): Part {
  return { type: 'text', text };
}
