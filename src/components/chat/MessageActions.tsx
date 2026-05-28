import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Message } from '@/db/types';
import { partsText, deriveTitle } from '@/lib/conversation';
import { downloadText, messageToMarkdown, slugify } from '@/lib/export';

export function MessageActions({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(messageToMarkdown(message));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const download = () => {
    const name = slugify(deriveTitle(partsText(message.content))) || 'message';
    downloadText(`${name}.md`, messageToMarkdown(message, { includeThinking: true }));
  };

  return (
    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy()}
        title="Copy as markdown"
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={download}
        title="Download .md"
      >
        <Download />
      </Button>
    </div>
  );
}
