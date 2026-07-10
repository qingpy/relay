import { useEffect, useState } from 'react';

/** An object URL for `blob` while `enabled`, revoked on change/unmount. */
export function useObjectUrl(blob: Blob, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob, enabled]);
  return enabled ? url : undefined;
}
