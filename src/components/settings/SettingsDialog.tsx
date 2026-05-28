import { useLiveQuery } from 'dexie-react-hooks';
import { getAppConfig, updateAppConfig } from '@/db/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useUiStore } from '@/store/ui';
import { AutoTitleSettings } from './AutoTitleSettings';
import { BackupSettings } from './BackupSettings';
import { ConnectionsManager } from './ConnectionsManager';
import { PromptsManager } from './PromptsManager';

const labelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            API keys are stored only in this browser (IndexedDB) and sent per
            request through the local proxy.
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 flex flex-col gap-5 overflow-y-auto pr-2">
          <ConnectionsManager />
          <AutoTitleSettings />
          <ExportSettings />
          <PromptsManager />
          <BackupSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  return (
    <section className="flex flex-col gap-2">
      <h3 className={labelClass}>Export</h3>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Include thinking in exports
          <span className="block text-xs text-muted-foreground">
            Adds the model's reasoning to copied / downloaded markdown.
          </span>
        </span>
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
