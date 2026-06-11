import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
import { getFolder, listConnections, updateFolderConfig } from '@/db/repo';
import { useResolvedConfig } from '@/lib/useResolved';
import { PresetEditor } from '@/components/sidebar/PresetEditor';
import { ModelSelect } from './ModelSelect';

/**
 * Header controls for the blank "new chat" bound to a preset — shown when a
 * preset is active but holds no chat yet. Mirrors `SessionControls`, but every
 * change lands on the preset itself (there is no chat yet); sending a message
 * creates the chat (Composer → `startNewSession`).
 */
export function PresetControls({ folderId }: { folderId: string }) {
  const connections = useLiveQuery(() => listConnections(), [], []);
  const folder = useLiveQuery(() => getFolder(folderId), [folderId]);
  const resolved = useResolvedConfig(null, folderId);
  const [editing, setEditing] = useState(false);
  if (!folder) return null;

  const onSelect = (connectionId: string, model: string) => {
    void updateFolderConfig(folderId, {
      connectionId: connectionId || null,
      model,
    });
  };

  return (
    <div className="flex min-w-0 items-center gap-4">
      <ModelSelect
        connections={connections}
        connectionId={resolved?.connection?.id ?? ''}
        model={resolved?.model ?? ''}
        onSelect={onSelect}
      />

      <Marginalia onClick={() => setEditing(true)}>Tune</Marginalia>

      <PresetEditor
        key={folder.id}
        folder={folder}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}
