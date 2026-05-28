import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAppConfig } from '@/db/db';
import { getMessages, getSession } from '@/db/repo';
import { downloadText, sessionToMarkdown, slugify } from '@/lib/export';
import { activePath } from '@/lib/tree';

export function ExportMenu({ sessionId }: { sessionId: string }) {
  const run = async () => {
    const [{ exportIncludeThinking }, session, all] = await Promise.all([
      getAppConfig(),
      getSession(sessionId),
      getMessages(sessionId),
    ]);
    if (!session) return;
    const messages = activePath(all, session.currentLeafId);
    const md = sessionToMarkdown(session, messages, {
      includeThinking: exportIncludeThinking,
    });
    downloadText(`${slugify(session.title)}.md`, md);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void run()}
      title="Export chat as markdown"
      aria-label="Export chat"
    >
      <Download />
    </Button>
  );
}
