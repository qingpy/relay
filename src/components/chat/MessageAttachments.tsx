import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText } from 'lucide-react';
import { getFilesByIds } from '@/db/repo';
import type { StoredFile } from '@/db/types';

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

function FileThumb({ file }: { file: StoredFile }) {
  const isImage = file.mimeType.startsWith('image/');
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file.blob, isImage]);

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt={file.name}
          className="max-h-48 rounded-lg border border-border object-cover"
        />
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs">
      <FileText className="size-4 text-muted-foreground" />
      <span className="max-w-48 truncate">{file.name}</span>
    </div>
  );
}
