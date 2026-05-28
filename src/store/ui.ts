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
  setActiveSession: (id) => set({ activeSessionId: id }),

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
