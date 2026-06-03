import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiStore } from '@/store/ui';

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

/** [chord, description]. A chord is space-separated keys; `|` renders as a `/`
 *  that separates alternatives, so a literal `/` is always shown as a key. */
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Composer',
    items: [
      [`${MOD} Enter`, 'Send message'],
      ['Enter', 'New line'],
      ['/', 'Quick-prompt palette'],
    ],
  },
  {
    title: 'Conversation',
    items: [
      ['Alt ↑ | ↓', 'Previous / next of your turns'],
      ['Ctrl Home | End', 'Jump to top / bottom'],
    ],
  },
  {
    title: 'App',
    items: [
      [`${MOD} B`, 'Toggle sidebar'],
      [`${MOD} /`, 'Keyboard shortcuts'],
    ],
  },
];

function Kbd({ combo }: { combo: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {combo.split(' ').map((k, i) =>
        k === '|' ? (
          <span key={i} className="px-0.5 text-muted-foreground">
            /
          </span>
        ) : (
          <kbd
            key={i}
            className="min-w-[1.5rem] border border-input bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] leading-tight text-foreground"
          >
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}

/**
 * App-wide keyboard handling. A global listener toggles the sidebar on ⌘/Ctrl+B,
 * opens this sheet on ⌘/Ctrl+/ (a modifier chord, so it never gets in the way of
 * typing a literal `?`), and leaves message/chat selection mode on Escape; the
 * dialog itself documents what's wired up.
 */
export function KeyboardShortcuts() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    const toggleHelp = () => {
      const s = useUiStore.getState();
      s.setShortcutsOpen(!s.shortcutsOpen);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (e.key === 'Escape') {
        const el = e.target as HTMLElement | null;
        const typing =
          !!el &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.isContentEditable);
        // Let text inputs (palette / edit) and open dialogs consume Escape first.
        if (typing || document.querySelector('[role="dialog"]')) return;
        const s = useUiStore.getState();
        if (s.selectionMode) {
          e.preventDefault();
          s.toggleSelectionMode();
        } else if (s.chatSelectMode) {
          e.preventDefault();
          s.toggleChatSelectMode();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md gap-6">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          The keyboard shortcuts available in Relay.
        </DialogDescription>
        <div className="flex flex-col gap-6">
          {GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-2.5">
              <span className="label-mono text-muted-foreground">{g.title}</span>
              {g.items.map(([combo, label]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-6"
                >
                  <span className="text-sm text-foreground">{label}</span>
                  <Kbd combo={combo} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
