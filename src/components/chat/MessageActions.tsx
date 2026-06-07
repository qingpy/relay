import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
import { getAppConfig } from '@/db/db';
import {
  getFilesByIds,
  removeFileContent,
  setCurrentLeaf,
  spliceMessage,
} from '@/db/repo';
import type { Message, StoredFile } from '@/db/types';
import { fileUnavailable } from '@/lib/attachments';
import { partsText, deriveTitle } from '@/lib/conversation';
import { downloadText, messageToMarkdown, slugify } from '@/lib/export';
import { useChatStore } from '@/store/chat';

/**
 * The marginalia action row beneath a message — quiet uppercase text links
 * rather than icon buttons. User turns get Edit/Regenerate; assistant turns get
 * Download; both share Copy/Branch/Delete.
 */
export function MessageActions({
  message,
  onEdit,
}: {
  message: Message;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  // Attachments whose bytes are still here — per-file removal is the hover ✕
  // on each thumbnail; Clean strips the whole turn's files to "removed" tags.
  const files = useLiveQuery(
    () => getFilesByIds(isUser ? (message.attachments ?? []) : []),
    [message.attachments?.join(',') ?? ''],
    [] as StoredFile[],
  );
  const removable = files.filter((f) => !fileUnavailable(f));

  const clean = () => void removeFileContent(removable.map((f) => f.id));

  const copy = async () => {
    await navigator.clipboard.writeText(messageToMarkdown(message));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const download = async () => {
    const { exportIncludeThinking } = await getAppConfig();
    const name = slugify(deriveTitle(partsText(message.content))) || 'message';
    downloadText(
      `${name}.md`,
      messageToMarkdown(message, { includeThinking: exportIncludeThinking }),
    );
  };

  const fork = () => void setCurrentLeaf(message.sessionId, message.id);

  const regenerate = () =>
    void useChatStore.getState().regenerate(message.sessionId, message.id);

  // Remove just this message — its replies are re-parented, not deleted.
  const remove = () => void spliceMessage(message.id);

  return (
    <div className="flex items-center gap-4">
      <Marginalia onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Marginalia>
      {isUser ? (
        <>
          <Marginalia onClick={onEdit}>Edit</Marginalia>
          <Marginalia onClick={regenerate}>Regenerate</Marginalia>
        </>
      ) : (
        <Marginalia onClick={() => void download()}>Download</Marginalia>
      )}
      <Marginalia onClick={fork}>Branch</Marginalia>
      {removable.length > 0 && <Marginalia onClick={clean}>Clean</Marginalia>}
      <Marginalia onClick={() => void remove()}>Delete</Marginalia>
    </div>
  );
}
