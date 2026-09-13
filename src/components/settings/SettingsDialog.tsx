import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_TRASH_RETENTION_DAYS,
  getAppConfig,
  updateAppConfig,
} from '@/db/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { UI_STYLES, type UiStyle } from '@/db/types';
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
  { id: 'chats', title: 'Chats' },
  { id: 'prompts', title: 'Quick prompts' },
  { id: 'sync', title: 'Sync & backup' },
];

const STYLE_LABEL: Record<UiStyle, string> = {
  stationery: 'Stationery',
  night: 'Night',
  paper: 'Paper',
  ink: 'Ink',
  soft: 'Soft',
};

/** Canvas + accent chips for the style row (must match index.css palettes). */
const STYLE_SWATCH: Record<UiStyle, { canvas: string; accent: string }> = {
  stationery: { canvas: '#f4f5f6', accent: '#425a70' },
  night: { canvas: '#16181c', accent: '#8aa4bc' },
  paper: { canvas: '#f3eee4', accent: '#6b4a32' },
  ink: { canvas: '#ffffff', accent: '#111111' },
  soft: { canvas: '#f4f5f6', accent: '#425a70' },
};

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
                  <StyleSettings />
                  <AutoTitleSettings />
                  <CodeBlockSettings />
                  <ExportSettings />
                  <TrashSettings />
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

function StyleSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const value = config?.uiStyle ?? 'stationery';
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Style</SectionLabel>
      <div className="flex items-center gap-2">
        {UI_STYLES.map((id) => {
          const sw = STYLE_SWATCH[id];
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              title={STYLE_LABEL[id]}
              aria-label={STYLE_LABEL[id]}
              aria-pressed={on}
              onClick={() => void updateAppConfig({ uiStyle: id })}
              className={cn(
                'flex size-8 shrink-0 flex-col overflow-hidden border transition-colors',
                on ? 'border-foreground' : 'border-input hover:border-foreground',
              )}
              style={id === 'soft' ? { borderRadius: 4 } : undefined}
            >
              <span className="min-h-0 flex-1" style={{ background: sw.canvas }} />
              <span className="h-1.5 shrink-0" style={{ background: sw.accent }} />
            </button>
          );
        })}
      </div>
    </section>
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

function TrashSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const days = config?.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Trash</SectionLabel>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Auto-remove deleted chats after</span>
        <span className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            className="h-8 w-20 px-2 py-1"
            value={days}
            onChange={(e) => {
              const n = Number(e.target.value);
              void updateAppConfig({
                trashRetentionDays:
                  Number.isFinite(n) && n >= 0
                    ? Math.floor(n)
                    : DEFAULT_TRASH_RETENTION_DAYS,
              });
            }}
          />
          <span className="text-muted-foreground">days</span>
        </span>
      </label>
    </section>
  );
}
