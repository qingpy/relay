import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  GitFork,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { getAppConfig } from '@/db/db';
import { deleteSubtree, setCurrentLeaf } from '@/db/repo';
import type { Message } from '@/db/types';
import { partsText, deriveTitle } from '@/lib/conversation';
import { downloadText, messageToMarkdown, slugify } from '@/lib/export';
import { childrenOf } from '@/lib/tree';
import { useChatStore } from '@/store/chat';

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
    <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy()}
        title="Copy as markdown"
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
      {isUser ? (
        <>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={regenerate}
            title="Regenerate reply"
          >
            <RefreshCw />
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void download()}
          title="Download .md"
        >
          <Download />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={fork}
        title="Branch from here"
      >
        <GitFork />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void remove()}
        title="Delete"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
