import { useLiveQuery } from 'dexie-react-hooks';
import { RotateCcw, Trash2 } from 'lucide-react';
import { confirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Marginalia } from '@/components/ui/marginalia';
import { DEFAULT_TRASH_RETENTION_DAYS, getAppConfig } from '@/db/db';
import {
  emptyTrash,
  listTrashedSessions,
  purgeSession,
  restoreSession,
} from '@/db/repo';
import { formatStamp } from '@/lib/time';
import { useUiStore } from '@/store/ui';

/** Deleted chats live here until restored, emptied, or auto-purged on launch. */
export function TrashDialog() {
  const open = useUiStore((s) => s.trashOpen);
  const setOpen = useUiStore((s) => s.setTrashOpen);
  const sessions = useLiveQuery(() => listTrashedSessions(), [], []);
  const config = useLiveQuery(() => getAppConfig(), []);
  const days = config?.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;

  const purge = async (id: string, title: string) => {
    const ok = await confirm({
      title: 'Delete forever?',
      description: `"${title}" and its messages will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await purgeSession(id);
  };

  const empty = async () => {
    const ok = await confirm({
      title: 'Empty trash?',
      description: `${sessions.length} chat${
        sessions.length > 1 ? 's' : ''
      } will be permanently removed.`,
      confirmLabel: 'Empty trash',
      destructive: true,
    });
    if (ok) await emptyTrash();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-5">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription className="sr-only">
            Deleted chats, restorable until removed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col divide-y divide-border overflow-y-auto border border-border">
          {sessions.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Trash is empty.
            </p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={s.title}>
                  {s.title}
                </div>
                {s.deletedAt && (
                  <div className="label-mono tabular-nums text-muted-foreground/50">
                    {formatStamp(s.deletedAt)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void restoreSession(s.id)}
                aria-label="Restore"
                className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void purge(s.id, s.title)}
                aria-label="Delete forever"
                className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground/50">
            {days > 0
              ? `Auto-removed after ${days} day${days > 1 ? 's' : ''}`
              : 'Kept until emptied'}
          </span>
          <Marginalia disabled={sessions.length === 0} onClick={() => void empty()}>
            Empty trash
          </Marginalia>
        </div>
      </DialogContent>
    </Dialog>
  );
}
