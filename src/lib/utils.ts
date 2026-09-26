import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, resolving conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Explorer-style shift-range: the inclusive run of `orderedIds` covering the
 *  anchor and every id in `end`, or null when the anchor isn't in the list. */
export function rangeBetween(
  orderedIds: string[],
  anchor: string | null,
  end: string | string[],
): string[] | null {
  if (!anchor) return null;
  const a = orderedIds.indexOf(anchor);
  if (a === -1) return null;
  let lo = a;
  let hi = a;
  let hit = false;
  for (const id of Array.isArray(end) ? end : [end]) {
    const i = orderedIds.indexOf(id);
    if (i === -1) continue;
    hit = true;
    if (i < lo) lo = i;
    if (i > hi) hi = i;
  }
  if (!hit) return null;
  return orderedIds.slice(lo, hi + 1);
}
