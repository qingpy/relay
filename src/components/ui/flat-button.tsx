import { forwardRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Example2's "flat box button" — a bordered, uppercase-monospace action used
 * across the settings panels (Add / Detect / Download / Restore …). White on
 * the canvas, ink border + slate text on hover.
 */
export const FlatButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'>
>(function FlatButton({ className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 border border-input bg-card px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.05em] text-foreground transition-colors hover:border-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
});
