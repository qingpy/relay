import { db, newId } from './db';
import type {
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
    order: now,
  };
  await db.sessions.add(session);
  return session;
}

export function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('updatedAt').reverse().toArray();
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
