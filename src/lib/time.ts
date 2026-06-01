function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * One fixed, locale-independent timestamp style across the app — numeric and
 * tabular, so it sits quietly in the mono treatment and never shifts shape with
 * the viewer's locale or how recent the time is.
 */

/** Full timestamp, for tooltips: "2026-06-01 14:32". */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Concise shown timestamp: "06-01 14:32", prefixed with the year only when it
 *  isn't the current one ("2025-12-12 09:05"). */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  const stamp = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
  return d.getFullYear() === new Date().getFullYear()
    ? stamp
    : `${d.getFullYear()}-${stamp}`;
}
