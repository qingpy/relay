import { forwardRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * An understated, uppercase-monospace text action — the "marginalia" links that
 * replace icon buttons throughout the app (Copy / Edit / Branch, the composer
 * toolbar, the header utility actions, …). Quiet slate by default, ink on
 * hover; `active` marks a toggle that is currently on (full slate, bolder).
 *
 * forwardRef so it can be used as a Radix `asChild` trigger (dialogs, menus).
 */
export const Marginalia = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'> & { active?: boolean }
>(function Marginalia({ className, active, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'label-mono cursor-pointer transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active ? 'text-primary [font-weight:600]' : 'text-primary/70',
        className,
      )}
      {...props}
    />
  );
});
