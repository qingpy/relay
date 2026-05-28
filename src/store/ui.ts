import { create } from 'zustand';
import { getTheme, setTheme as applyTheme, type Theme } from '@/lib/theme';

const COLLAPSED_KEY = 'relay.collapsedFolders';

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

  /** Multi-select mode for assistant messages (bulk copy/export/delete). */
  selectionMode: boolean;
  selected: Record<string, true>;
  toggleSelectionMode: () => void;
  setMessageSelected: (id: string, on: boolean) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;

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

  collapsedFolders: Record<string, boolean>;
  toggleFolder: (id: string) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSessionId: null,
  setActiveSession: (id) =>
    set({ activeSessionId: id, selectionMode: false, selected: {} }),

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
  clearSelection: () => set({ selected: {} }),

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

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  collapsedFolders: loadCollapsed(),
  toggleFolder: (id) =>
    set((s) => {
      const next = { ...s.collapsedFolders, [id]: !s.collapsedFolders[id] };
      if (!next[id]) delete next[id];
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return { collapsedFolders: next };
    }),

  theme: getTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
