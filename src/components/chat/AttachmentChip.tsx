import { useEffect, useRef, useState } from 'react';
import { FileText, FileX, X } from 'lucide-react';
import { classify } from '@/lib/attachments';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { cn } from '@/lib/utils';

/**
 * A removable attachment chip — image thumbnail or file icon + name. Shared by
 * the composer (files pending send) and the message editor (existing + newly
 * added attachments). `unavailable` marks a tombstone (the bytes are gone);
 * its ✕ detaches the row entirely, dropping the "removed" tag.
 */
export function AttachmentChip({
  name,
  mimeType,
  blob,
  unavailable,
  onRemove,
}: {
  name: string;
  mimeType: string;
  blob: Blob;
  unavailable?: boolean;
  onRemove: () => void;
}) {
  const isImage = !unavailable && mimeType.startsWith('image/');
  const url = useObjectUrl(blob, isImage);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 border border-border bg-muted/50 py-1 pl-1.5 pr-1 text-xs',
        unavailable && 'border-dashed bg-transparent text-muted-foreground',
      )}
    >
      {isImage && url ? (
        <img src={url} alt="" className="size-7 object-cover" />
      ) : unavailable ? (
        <FileX className="size-4 text-muted-foreground" />
      ) : (
        <FileText className="size-4 text-muted-foreground" />
      )}
      <span className="max-w-32 truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="flex size-5 items-center justify-center text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/** Why a file was refused — a missing model capability, or binary bytes. */
function refusalReason(file: File): string {
  const kind = classify(file.type, file.name);
  if (kind === 'image') return 'this model does not take images';
  if (kind === 'pdf') return 'this model does not take PDFs';
  return 'binary files cannot be attached';
}

/**
 * Transient feedback for files that can't be attached (binary bytes, or no
 * vision/PDF support) — attaching used to drop them silently. Returns the
 * note to render and a reporter to call with the refused files.
 */
export function useRefusedNote(): [string | null, (refused: File[]) => void] {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const report = (refused: File[]) => {
    if (refused.length === 0) return;
    setNote(
      refused.length === 1
        ? `${refused[0].name} — ${refusalReason(refused[0])}`
        : `${refused.length} files cannot be attached`,
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 4000);
  };

  return [note, report];
}
