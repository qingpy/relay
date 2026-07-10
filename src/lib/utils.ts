import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, resolving conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Explorer-style shift-range: the inclusive run of `orderedIds` between the
 *  anchor and `id`, or null when either end isn't in the list. */
export function rangeBetween(
  orderedIds: string[],
  anchor: string | null,
  id: string,
): string[] | null {
  if (!anchor) return null;
  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(id);
  if (a === -1 || b === -1) return null;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return orderedIds.slice(lo, hi + 1);
}
