import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, FileX, X } from 'lucide-react';
import { getFilesByIds, removeFileContent } from '@/db/repo';
import type { StoredFile } from '@/db/types';
import { fileUnavailable } from '@/lib/attachments';
import { useObjectUrl } from '@/lib/useObjectUrl';
import { cn } from '@/lib/utils';

export function MessageAttachments({ fileIds }: { fileIds: string[] }) {
  const files = useLiveQuery(
    () => getFilesByIds(fileIds),
    [fileIds.join(',')],
    [],
  );
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <FileThumb key={f.id} file={f} />
      ))}
    </div>
  );
}

/** Drops the attachment's content on the spot, leaving the "removed" tag. */
function RemoveButton({
  file,
  className,
}: {
  file: StoredFile;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void removeFileContent([file.id])}
      aria-label="Remove attachment"
      className={cn(
        'flex size-5 items-center justify-center text-muted-foreground opacity-0 transition hover:text-foreground group-hover/file:opacity-100',
        className,
      )}
    >
      <X className="size-3" />
    </button>
  );
}

function FileThumb({ file }: { file: StoredFile }) {
  const gone = fileUnavailable(file);
  const isImage = !gone && file.mimeType.startsWith('image/');
  const url = useObjectUrl(file.blob, isImage);

  // The bytes are gone (removed here, or never carried by the snapshot that
  // brought the row to this device) — a quiet tag marks where the file was.
  if (gone) {
    return (
      <div className="flex items-center gap-2 border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        <FileX className="size-4" />
        <span className="max-w-48 truncate">{file.name}</span>
        <span className="label-mono">{file.removedAt ? 'Removed' : 'Missing'}</span>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="group/file relative">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={file.name}
            className="max-h-48 rounded-lg border border-border object-cover"
          />
        </a>
        <RemoveButton
          file={file}
          className="absolute right-1 top-1 border border-border bg-card"
        />
      </div>
    );
  }

  return (
    <div className="group/file flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1.5 pl-2.5 pr-1.5 text-xs">
      <FileText className="size-4 text-muted-foreground" />
      <span className="max-w-48 truncate">{file.name}</span>
      <RemoveButton file={file} />
    </div>
  );
}
