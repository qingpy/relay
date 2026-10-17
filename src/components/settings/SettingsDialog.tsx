import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_ASIDE_PROMPT,
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
import { fieldClass, Input } from '@/components/ui/input';
import { Marginalia } from '@/components/ui/marginalia';
import { Switch } from '@/components/ui/switch';
import { resolveStyle, UI_STYLES, type UiStyle } from '@/db/types';
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
  relay: 'Relay',
  archival: 'Archival',
  monograph: 'Monograph',
  botanical: 'Botanical',
  studio: 'Studio',
  carbon: 'Carbon',
  polar: 'Polar',
};

/** Sidebar / canvas / accent chips for the style row — a miniature of each
 *  style's surface topology (must match index.css palettes). */
const STYLE_SWATCH: Record<UiStyle, { side: string; canvas: string; accent: string }> = {
  relay: { side: '#f4f5f6', canvas: '#f4f5f6', accent: '#425a70' },
  archival: { side: '#ece5d8', canvas: '#fbf8f2', accent: '#7d2a2a' },
  monograph: { side: '#ffffff', canvas: '#ffffff', accent: '#d92d1a' },
  botanical: { side: '#e7ebe2', canvas: '#f5f3ee', accent: '#1f5240' },
  studio: { side: '#18181b', canvas: '#f8f7f4', accent: '#c84b31' },
  carbon: { side: '#0d0e11', canvas: '#111214', accent: '#e5a93c' },
  polar: { side: '#191d24', canvas: '#191d24', accent: '#8fd3e8' },
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
                  <AsideSettings />
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
  const value = resolveStyle(config?.uiStyle);
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
                'flex size-8 shrink-0 overflow-hidden border transition-colors',
                on ? 'border-foreground' : 'border-input hover:border-foreground',
              )}
            >
              <span className="w-2 shrink-0 border-r border-black/10" style={{ background: sw.side }} />
              <span className="flex min-w-0 flex-1 flex-col" style={{ background: sw.canvas }}>
                <span className="min-h-0 flex-1" />
                <span className="h-1.5 shrink-0" style={{ background: sw.accent }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AsideSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  // Local buffer, as with the title prompt: a live-query round trip per
  // keystroke resets the caret and breaks IME composition.
  const [prompt, setPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (config && prompt === null) {
      setPrompt(config.asidePrompt ?? DEFAULT_ASIDE_PROMPT);
    }
  }, [config, prompt]);
  if (!config || prompt === null) return null;

  // As with the title prompt: unset follows the built-in default, only a
  // customized prompt is stored, empty means none.
  const save = (v: string) => {
    setPrompt(v);
    void updateAppConfig({ asidePrompt: v === DEFAULT_ASIDE_PROMPT ? undefined : v });
  };
  const reset = () => {
    setPrompt(DEFAULT_ASIDE_PROMPT);
    void updateAppConfig({ asidePrompt: undefined });
  };
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Aside prompt</SectionLabel>
        {config.asidePrompt !== undefined && (
          <Marginalia onClick={reset}>Reset</Marginalia>
        )}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => save(e.target.value)}
        rows={3}
        className={`${fieldClass} resize-y`}
      />
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
