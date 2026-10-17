import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Marginalia } from '@/components/ui/marginalia';
import { Composer } from '@/components/chat/Composer';
import { ContextMeter } from '@/components/chat/ContextMeter';
import { ExportMenu } from '@/components/chat/ExportMenu';
import { MessageList } from '@/components/chat/MessageList';
import { PresetControls } from '@/components/chat/PresetControls';
import { SessionControls } from '@/components/chat/SessionControls';
import { TreeMap } from '@/components/chat/TreeMap';
import { SaveIndicator } from '@/components/layout/SaveIndicator';
import { getSession, listFolders } from '@/db/repo';
import { leaveChat } from '@/lib/session-actions';
import { useUiStore } from '@/store/ui';

export function ChatPane() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeId = useUiStore((s) => s.activeSessionId);
  const activePresetId = useUiStore((s) => s.activePresetId);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const toggleSelectionMode = useUiStore((s) => s.toggleSelectionMode);

  const folders = useLiveQuery(() => listFolders(), [], []);
  // Whether the open chat is gone (trashed or missing), tagged with the id it
  // answers for: across an id change the hook still returns the previous
  // chat's answer, which must never decide for the new one.
  const check = useLiveQuery(async () => {
    if (!activeId) return null;
    const s = await getSession(activeId);
    return { id: activeId, gone: !s || s.deletedAt != null };
  }, [activeId]);
  const gone = !!activeId && check?.id === activeId && check.gone;
  // Never render a gone chat; step off it to a neighbor. Until the check
  // settles, keep the id so switching chats doesn't flash empty.
  const openId = gone ? null : activeId;
  useEffect(() => {
    if (gone && activeId) void leaveChat(activeId);
  }, [gone, activeId]);
  // With no chat open, fall back to a blank chat bound to the active preset (so
  // its model/tune show and a sent message starts a chat there). The bare "Relay"
  // page is only for a fresh load or when there are no presets at all.
  const presetId =
    !openId && activePresetId && folders.some((f) => f.id === activePresetId)
      ? activePresetId
      : null;

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open sidebar"
            className="font-mono text-base leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ▸
          </button>
        )}
        {openId ? (
          <SessionControls sessionId={openId} />
        ) : presetId ? (
          <PresetControls folderId={presetId} />
        ) : (
          <span className="label-mono text-muted-foreground">Relay</span>
        )}
        <div className="ml-auto flex items-center gap-4">
          <SaveIndicator />
          {openId && <ContextMeter sessionId={openId} />}
          {openId && <TreeMap sessionId={openId} />}
          {openId && (
            <Marginalia onClick={toggleSelectionMode} active={selectionMode}>
              Select
            </Marginalia>
          )}
          {openId && <ExportMenu sessionId={openId} />}
          <Marginalia onClick={() => setShortcutsOpen(true)}>Keys</Marginalia>
          <Marginalia onClick={() => setSettingsOpen(true)}>Settings</Marginalia>
        </div>
      </header>

      {openId ? <MessageList sessionId={openId} /> : <div className="flex-1" />}

      <Composer sessionId={openId} folderId={presetId} />
    </main>
  );
}
