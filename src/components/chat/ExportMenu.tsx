import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getMessages, getSession } from '@/db/repo';
import { downloadText, sessionToMarkdown, slugify } from '@/lib/export';

export function ExportMenu({ sessionId }: { sessionId: string }) {
  const run = async (includeThinking: boolean) => {
    const [session, messages] = await Promise.all([
      getSession(sessionId),
      getMessages(sessionId),
    ]);
    if (!session) return;
    const md = sessionToMarkdown(session, messages, { includeThinking });
    downloadText(`${slugify(session.title)}.md`, md);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Export chat"
          aria-label="Export chat"
        >
          <Download />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run(true)}>
          Export with thinking
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run(false)}>
          Export answers only
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
