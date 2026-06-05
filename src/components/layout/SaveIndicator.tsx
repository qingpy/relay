import { flushLocalStore } from '@/lib/localstore';
import { useUiStore } from '@/store/ui';

/**
 * The unsaved-changes warning. Invisible while saves succeed (the steady
 * state); when a flush to the data file is failing, an inverted ink chip
 * appears in the header — changes exist only in browser memory, so closing
 * or refreshing now would lose them. Clicking retries the save immediately
 * (it also retries itself on a backoff timer).
 */
export function SaveIndicator() {
  const status = useUiStore((s) => s.dataStatus);
  const error = useUiStore((s) => s.dataError);
  if (status !== 'error') return null;
  return (
    <button
      type="button"
      onClick={() => void flushLocalStore()}
      title={`Changes are not saved to disk — retrying automatically; click to retry now.\n${error}`}
      className="label-mono cursor-pointer bg-destructive px-1.5 py-0.5 text-destructive-foreground"
    >
      Unsaved
    </button>
  );
}
