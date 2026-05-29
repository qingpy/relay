import { useEffect, useState } from 'react';
import { getDataInfo, type DataInfo } from '@/lib/localstore';
import { SectionLabel } from './SectionLabel';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Read-only readout of the local data store (ARCHITECTURE.md §4). The path is set
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
    <section className="flex flex-col gap-2">
      <SectionLabel>Local data store</SectionLabel>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {info && (
        <div className="flex items-baseline gap-3 text-xs">
          <span
            className="min-w-0 flex-1 truncate font-mono text-muted-foreground"
            title={info.path}
          >
            {info.path}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {info.exists ? formatBytes(info.size ?? 0) : 'Not created yet'}
          </span>
        </div>
      )}
    </section>
  );
}
