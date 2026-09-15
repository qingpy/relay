import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, FileX, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getFilesByIds, removeFileContent } from '@/db/repo';
import type { StoredFile } from '@/db/types';
import { classify, fileUnavailable } from '@/lib/attachments';
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
  const [open, setOpen] = useState(false);
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
      <>
        <div className="group/file relative">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block cursor-zoom-in border-0 bg-transparent p-0"
          >
            <img
              src={url}
              alt={file.name}
              className="max-h-48 rounded-lg border border-border object-cover"
            />
          </button>
          <RemoveButton
            file={file}
            className="absolute right-1 top-1 border border-border bg-card"
          />
        </div>
        <FilePreview file={file} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <div className="group/file flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1.5 pl-2.5 pr-1.5 text-xs">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="max-w-48 truncate">{file.name}</span>
        </button>
        <RemoveButton file={file} />
      </div>
      <FilePreview file={file} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** In-app preview for an image, PDF, or text attachment. */
function FilePreview({
  file,
  open,
  onOpenChange,
}: {
  file: StoredFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const kind = classify(file.mimeType, file.name);
  const url = useObjectUrl(file.blob, open && (kind === 'image' || kind === 'pdf'));
  const [text, setText] = useState<string>();

  useEffect(() => {
    if (!open || kind !== 'text') return;
    let live = true;
    void file.blob.text().then((t) => {
      if (live) setText(t);
    });
    return () => {
      live = false;
    };
  }, [open, kind, file.blob]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-[min(92vw,64rem)] flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-border px-5 py-3 pr-14">
          <DialogTitle className="truncate font-sans text-sm font-normal normal-case tracking-normal">
            {file.name}
          </DialogTitle>
        </DialogHeader>
        {kind === 'image' && url && (
          <img
            src={url}
            alt={file.name}
            className="max-h-[80vh] w-full object-contain"
          />
        )}
        {kind === 'pdf' && url && (
          <iframe src={url} title={file.name} className="h-[80vh] w-full border-0" />
        )}
        {kind === 'text' && (
          <pre className="max-h-[80vh] overflow-auto whitespace-pre-wrap break-words p-5 text-[13px] leading-relaxed">
            {text}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
