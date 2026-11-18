import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface PreferencesState {
  theme: Theme;
  sidebarCollapsed: boolean;
  applicationId: string | null;
  environmentId: string | null;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setScope: (applicationId: string | null, environmentId?: string | null) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarCollapsed: false,
      applicationId: null,
      environmentId: null,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setScope: (applicationId, environmentId = null) => set({ applicationId, environmentId }),
    }),
    { name: 'shieldops.preferences.v1' },
  ),
);

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}