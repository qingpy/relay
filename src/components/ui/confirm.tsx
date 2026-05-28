import { create } from 'zustand';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  request: (options: ConfirmOptions, resolve: (v: boolean) => void) => void;
  settle: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  request: (options, resolve) => set({ open: true, options, resolve }),
  settle: (value) => {
    get().resolve?.(value);
    set({ open: false, resolve: null });
  },
}));

/** Imperative confirmation. Resolves true if confirmed, false otherwise. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) =>
    useConfirmStore.getState().request(options, resolve),
  );
}

export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={options?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
