import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  getSession,
  listFolders,
  moveSessionToFolder,
  setSessionSystemPrompt,
  updateFolderConfig,
} from '@/db/repo';
import type { Session } from '@/db/types';
import { useResolvedConfig } from '@/lib/useResolved';

const selectClass =
  'h-8 max-w-40 rounded-md border border-input bg-transparent pl-2.5 pr-7 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring';

export function SessionControls({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  const folders = useLiveQuery(() => listFolders(), [], []);
  const resolved = useResolvedConfig(sessionId);
  if (!session) return null;

  const models = resolved?.connection?.models ?? [];
  // Switching the model in the header applies to the whole preset.
  const onModel = (model: string) => {
    if (session.folderId) void updateFolderConfig(session.folderId, { model });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        value={session.folderId ?? ''}
        onChange={(e) =>
          void moveSessionToFolder(sessionId, e.target.value || null)
        }
        className={selectClass}
        title="Preset"
      >
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <select
        value={resolved?.model ?? ''}
        onChange={(e) => onModel(e.target.value)}
        disabled={!session.folderId}
        className={selectClass}
        title="Model (applies to the whole preset)"
      >
        {resolved?.model && !models.some((m) => m.id === resolved.model) && (
          <option value={resolved.model}>{resolved.model}</option>
        )}
        {models.length === 0 && <option value="">No models</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label || m.id}
          </option>
        ))}
      </select>

      <ChatPromptPopover key={session.id} session={session} />
    </div>
  );
}

function ChatPromptPopover({ session }: { session: Session }) {
  const [value, setValue] = useState(session.systemPrompt ?? '');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Chat system prompt"
          aria-label="Chat system prompt"
        >
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Chat system prompt</label>
          <p className="text-xs text-muted-foreground">
            Appended to the preset's system prompt. Model & settings are set on
            the preset.
          </p>
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              void setSessionSystemPrompt(session.id, e.target.value);
            }}
            rows={5}
            placeholder="Extra instructions for this chat…"
            className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
