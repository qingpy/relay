import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/ui';
import type { Theme } from '@/lib/theme';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' } as const;

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const Icon = ICON[theme];

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={cycle}
      title={LABEL[theme]}
      aria-label={LABEL[theme]}
    >
      <Icon />
    </Button>
  );
}
