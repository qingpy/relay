import * as React from 'react';
import { cn } from '@/lib/utils';

/** Hairline field chrome — same as Tune (PresetEditor), no focus ring. */
export const fieldClass =
  'w-full border border-input bg-transparent px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} className={cn(fieldClass, className)} {...props} />
));
Input.displayName = 'Input';

export { Input };
