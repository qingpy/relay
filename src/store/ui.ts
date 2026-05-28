import { create } from 'zustand';
import { getTheme, setTheme as applyTheme, type Theme } from '@/lib/theme';

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

  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  theme: getTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
