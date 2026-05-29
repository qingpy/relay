import { forwardRef, type ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Example2's flat select — bordered, no native chrome, custom chevron. */
export const FlatSelect = forwardRef<
  HTMLSelectElement,
  ComponentProps<'select'>
>(function FlatSelect({ className, children, ...props }, ref) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none border border-input bg-transparent px-3.5 py-2.5 pr-9 text-sm outline-none transition-colors focus-visible:border-primary disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});
