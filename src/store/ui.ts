import { create } from 'zustand';

const COLLAPSED_KEY = 'relay.collapsedFolders';

/** Below `md` the sidebar overlays the chat, so it starts closed and dismisses
 *  itself once a chat is opened. */
const isNarrow = () => window.matchMedia('(max-width: 767px)').matches;

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Ephemeral UI state. Persistent data (sessions, messages, …) lives in Dexie
 * and is read via `useLiveQuery`; this store only holds view state.
 */
interface UiState {
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;

  /** Preset that new top-level chats are created in. */
  activePresetId: string | null;
  setActivePreset: (id: string | null) => void;

  /** Multi-select mode for messages — you + assistant (bulk copy/export/delete). */
  selectionMode: boolean;
  selected: Record<string, true>;
  toggleSelectionMode: () => void;
  setMessageSelected: (id: string, on: boolean) => void;
  setSelection: (ids: string[]) => void;
  /** Turn a set of messages on without clearing the rest (shift-range select). */
  addSelection: (ids: string[]) => void;
  clearSelection: () => void;

  /** A message the list should scroll to (set by the branch map; the list clears
   *  it once it has located the message). */
  locateId: string | null;
  requestLocate: (id: string | null) => void;

  /** Multi-select mode for sidebar chats (bulk delete / move to preset). */
  chatSelectMode: boolean;
  selectedChats: Record<string, true>;
  toggleChatSelectMode: () => void;
  setChatSelected: (id: string, on: boolean) => void;
  setChatSelection: (ids: string[]) => void;
  clearChatSelection: () => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  trashOpen: boolean;
  setTrashOpen: (open: boolean) => void;

  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  /** WebDAV sync state for the Settings readout (`off` = not configured). */
  syncStatus: 'off' | 'syncing' | 'synced' | 'error';
  setSyncStatus: (s: UiState['syncStatus']) => void;

  /** Local data-file save state. `error` means changes exist that have NOT
   *  reached disk (the flush failed and is retrying) — surfaced in the header
   *  so a failing save is never silent. */
  dataStatus: 'saved' | 'saving' | 'error';
  dataError: string;
  setDataStatus: (s: UiState['dataStatus'], error?: string) => void;

  collapsedFolders: Record<string, boolean>;
  toggleFolder: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSessionId: null,
  setActiveSession: (id) =>
    set({
      activeSessionId: id,
      selectionMode: false,
      selected: {},
      locateId: null,
      // On a narrow screen the sidebar is an overlay — get out of the way.
      ...(id && isNarrow() ? { sidebarOpen: false } : {}),
    }),

  activePresetId: null,
  setActivePreset: (id) => set({ activePresetId: id }),

  selectionMode: false,
  selected: {},
  toggleSelectionMode: () =>
    set((s) => ({ selectionMode: !s.selectionMode, selected: {} })),
  setMessageSelected: (id, on) =>
    set((s) => {
      const selected = { ...s.selected };
      if (on) selected[id] = true;
      else delete selected[id];
      return { selected };
    }),
  setSelection: (ids) =>
    set({ selected: Object.fromEntries(ids.map((id) => [id, true])) }),
  addSelection: (ids) =>
    set((s) => {
      const selected = { ...s.selected };
      for (const id of ids) selected[id] = true;
      return { selected };
    }),
  clearSelection: () => set({ selected: {} }),

  locateId: null,
  requestLocate: (id) => set({ locateId: id }),

  chatSelectMode: false,
  selectedChats: {},
  toggleChatSelectMode: () =>
    set((s) => ({ chatSelectMode: !s.chatSelectMode, selectedChats: {} })),
  setChatSelected: (id, on) =>
    set((s) => {
      const selectedChats = { ...s.selectedChats };
      if (on) selectedChats[id] = true;
      else delete selectedChats[id];
      return { selectedChats };
    }),
  setChatSelection: (ids) =>
    set({ selectedChats: Object.fromEntries(ids.map((id) => [id, true])) }),
  clearChatSelection: () => set({ selectedChats: {} }),

  sidebarOpen: !isNarrow(),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  trashOpen: false,
  setTrashOpen: (open) => set({ trashOpen: open }),

  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  syncStatus: 'off',
  setSyncStatus: (s) => set({ syncStatus: s }),

  dataStatus: 'saved',
  dataError: '',
  setDataStatus: (s, error = '') => set({ dataStatus: s, dataError: error }),

  collapsedFolders: loadCollapsed(),
  toggleFolder: (id) =>
    set((s) => {
      const next = { ...s.collapsedFolders, [id]: !s.collapsedFolders[id] };
      if (!next[id]) delete next[id];
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return { collapsedFolders: next };
    }),
}));
