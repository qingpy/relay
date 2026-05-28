import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFolder, getSession, listConnections, updateFolderConfig } from '@/db/repo';
import { decodeModelChoice, encodeModelChoice, modelGroups } from '@/lib/models';
import { useResolvedConfig } from '@/lib/useResolved';
import { PresetEditor } from '@/components/sidebar/PresetEditor';

const selectClass =
  'h-8 max-w-40 rounded-md border border-input bg-transparent pl-2.5 pr-7 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring';

export function SessionControls({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);
  const connections = useLiveQuery(() => listConnections(), [], []);
  const folder = useLiveQuery(
    () => (session?.folderId ? getFolder(session.folderId) : undefined),
    [session?.folderId],
  );
  const resolved = useResolvedConfig(sessionId);
  const [editing, setEditing] = useState(false);
  if (!session) return null;

  const groups = modelGroups(connections);
  const current = resolved?.connection?.id ?? '';
  // Switching the model in the header applies to the whole preset.
  const onModel = (value: string) => {
    const next = decodeModelChoice(value);
    if (session.folderId) {
      void updateFolderConfig(session.folderId, {
        connectionId: next.connectionId || null,
        model: next.model,
      });
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        value={encodeModelChoice(current, resolved?.model ?? '')}
        onChange={(e) => onModel(e.target.value)}
        disabled={!session.folderId}
        className={selectClass}
        title="Model (applies to the whole preset)"
      >
        {resolved?.model &&
          !resolved.connection?.models.some((m) => m.id === resolved.model) && (
            <option value={encodeModelChoice(current, resolved.model)}>
              {resolved.model}
            </option>
          )}
        {groups.length === 0 && <option value="">No models</option>}
        {groups.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.models.map((m) => (
              <option key={m.id} value={encodeModelChoice(c.id, m.id)}>
                {m.label || m.id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setEditing(true)}
        disabled={!folder}
        title="Preset & chat settings"
        aria-label="Preset & chat settings"
      >
        <SlidersHorizontal />
      </Button>

      {folder && (
        <PresetEditor
          key={folder.id}
          folder={folder}
          session={session}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
    </div>
  );
}
