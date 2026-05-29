import { useState } from 'react';
import { Marginalia } from '@/components/ui/marginalia';
import { confirm } from '@/components/ui/confirm';
import { getAppConfig } from '@/db/db';
import { deleteSubtree, setCurrentLeaf } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText, deriveTitle } from '@/lib/conversation';
import { downloadText, messageToMarkdown, slugify } from '@/lib/export';
import { childrenOf } from '@/lib/tree';
import { useChatStore } from '@/store/chat';

/**
 * The marginalia action row beneath a message — quiet uppercase text links
 * rather than icon buttons. User turns get Edit/Regenerate; assistant turns get
 * Download; both share Copy/Branch/Delete.
 */
export function MessageActions({
  message,
  allMessages,
  onEdit,
}: {
  message: Message;
  allMessages: Message[];
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

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

  const remove = async () => {
    if (childrenOf(allMessages, message.id).length > 0) {
      const ok = await confirm({
        title: 'Delete this branch?',
        description: 'This message and every reply below it will be removed.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
    }
    await deleteSubtree(message.id);
  };

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
      <Marginalia onClick={() => void remove()}>Delete</Marginalia>
    </div>
  );
}
