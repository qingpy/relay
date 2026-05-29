import { useEffect, useState } from 'react';
import { getDataInfo, type DataInfo } from '@/lib/localstore';
import { formatDateTime } from '@/lib/time';
import { SectionLabel } from './SectionLabel';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Read-only readout of the local data store (plan §9). The path is set
 * server-side via `RELAY_DATA_FILE` at launch — the browser doesn't repoint the
 * proxy's filesystem target — so it's shown, not edited, here.
 */
export function DataStoreSettings() {
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDataInfo()
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Local data store</SectionLabel>
      <p className="text-xs text-muted-foreground">
        Your chats and settings live in this file on disk — off the browser, so
        they don’t grow your browser profile. The proxy owns it; WebDAV (below)
        mirrors it to your other devices. Set the path with{' '}
        <code className="font-mono">RELAY_DATA_FILE</code> when you start Relay.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {info && (
        <div className="flex flex-col gap-2 border border-border p-3">
          <div className="flex flex-col gap-1">
            <span className="label-mono text-muted-foreground">File</span>
            <span className="break-all font-mono text-xs text-foreground" title={info.path}>
              {info.path}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {info.exists ? formatBytes(info.size ?? 0) : 'Not created yet'}
            </span>
            {info.exists && info.savedAt && (
              <span>Saved {formatDateTime(info.savedAt)}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
