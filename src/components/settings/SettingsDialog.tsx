import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAppConfig, updateAppConfig } from '@/db/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { AutoTitleSettings } from './AutoTitleSettings';
import { BackupSettings } from './BackupSettings';
import { ConnectionsManager } from './ConnectionsManager';
import { DataStoreSettings } from './DataStoreSettings';
import { PromptsManager } from './PromptsManager';
import { SectionLabel } from './SectionLabel';
import { WebdavSettings } from './WebdavSettings';

type PanelId = 'connections' | 'prompts' | 'chats' | 'sync';

const ITEMS: { id: PanelId; title: string }[] = [
  { id: 'connections', title: 'Connections' },
  { id: 'prompts', title: 'Quick prompts' },
  { id: 'chats', title: 'Chats' },
  { id: 'sync', title: 'Sync & backup' },
];

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const [panel, setPanel] = useState<PanelId>('connections');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[80vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogDescription className="sr-only">
          Relay settings — connections, prompts, chat behavior, and backups.
        </DialogDescription>

        {/* Menu */}
        <nav className="flex w-56 shrink-0 flex-col border-r border-border p-3">
          <DialogTitle className="px-3 pb-4 pt-2">Settings</DialogTitle>
          {ITEMS.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setPanel(it.id)}
              className={cn(
                'px-3 py-2.5 text-left text-sm transition-colors',
                panel === it.id
                  ? 'bg-accent font-medium text-primary'
                  : 'text-foreground hover:bg-accent/50',
              )}
            >
              {it.title}
            </button>
          ))}
        </nav>

        {/* Detail */}
        <div className="flex min-w-0 flex-1 flex-col">
          {panel === 'prompts' ? (
            <div className="h-full min-h-0 px-8 pb-8 pt-12">
              <PromptsManager />
            </div>
          ) : (
            // Extra top padding so the first section clears the dialog's
            // floating close (×) at the top-right corner.
            <div className="flex h-full min-h-0 flex-col gap-10 overflow-y-auto px-8 pb-8 pt-12">
              {panel === 'connections' && <ConnectionsManager />}
              {panel === 'chats' && (
                <>
                  <AutoTitleSettings />
                  <CodeBlockSettings />
                  <ExportSettings />
                </>
              )}
              {panel === 'sync' && (
                <>
                  <DataStoreSettings />
                  <BackupSettings />
                  <WebdavSettings />
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CodeBlockSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Code blocks</SectionLabel>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Wrap long lines</span>
        <Switch
          checked={config?.wrapCodeBlocks ?? true}
          onCheckedChange={(v) => void updateAppConfig({ wrapCodeBlocks: v })}
        />
      </label>
    </section>
  );
}

function ExportSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Export</SectionLabel>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Include thinking in exports</span>
        <Switch
          checked={config?.exportIncludeThinking ?? false}
          onCheckedChange={(v) =>
            void updateAppConfig({ exportIncludeThinking: v })
          }
        />
      </label>
    </section>
  );
}
