import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';

/**
 * A removable attachment chip — image thumbnail or file icon + name. Shared by
 * the composer (files pending send) and the message editor (existing + newly
 * added attachments).
 */
export function AttachmentChip({
  name,
  mimeType,
  blob,
  onRemove,
}: {
  name: string;
  mimeType: string;
  blob: Blob;
  onRemove: () => void;
}) {
  const isImage = mimeType.startsWith('image/');
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob, isImage]);

  return (
    <div className="flex items-center gap-1.5 border border-border bg-muted/50 py-1 pl-1.5 pr-1 text-xs">
      {isImage && url ? (
        <img src={url} alt="" className="size-7 object-cover" />
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

/**
 * Transient feedback for files the current model can't take (no vision/PDF
 * support) — attaching used to drop them silently. Returns the note to render
 * and a reporter to call with the refused files.
 */
export function useRefusedNote(): [string | null, (refused: File[]) => void] {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const report = (refused: File[]) => {
    if (refused.length === 0) return;
    setNote(
      refused.length === 1
        ? `${refused[0].name} — not supported by this model`
        : `${refused.length} files not supported by this model`,
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 4000);
  };

  return [note, report];
}
