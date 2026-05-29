import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
import { getFolder, getSession, listConnections, updateFolderConfig } from '@/db/repo';
import { useResolvedConfig } from '@/lib/useResolved';
import { PresetEditor } from '@/components/sidebar/PresetEditor';
import { ModelSelect } from './ModelSelect';

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

  // Switching the model in the header applies to the whole preset.
  const onSelect = (connectionId: string, model: string) => {
    if (session.folderId) {
      void updateFolderConfig(session.folderId, {
        connectionId: connectionId || null,
        model,
      });
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-4">
      <ModelSelect
        connections={connections}
        connectionId={resolved?.connection?.id ?? ''}
        model={resolved?.model ?? ''}
        disabled={!session.folderId}
        onSelect={onSelect}
      />

      <Marginalia
        onClick={() => setEditing(true)}
        disabled={!folder}
        title="Model, parameters & instructions"
      >
        Tune
      </Marginalia>

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
