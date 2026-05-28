export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'relay.theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolve(theme) === 'dark');
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

/** Apply the persisted theme on boot and keep `system` in sync with the OS. */
export function initTheme() {
  apply(getTheme());
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getTheme() === 'system') apply('system');
    });
}
