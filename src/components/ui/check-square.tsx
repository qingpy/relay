import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Flat selection box used everywhere a multi-select toggle is needed (sidebar
 * presets/chats, message selection, model picker, branch map). `partial` shows
 * a dash for "some but not all" (e.g. a preset with a subset of chats selected).
 */
export function CheckSquare({
  checked,
  partial,
  className,
}: {
  checked?: boolean;
  partial?: boolean;
  className?: string;
}) {
  const on = checked || partial;
  return (
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center border transition-colors',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        className,
      )}
    >
      {checked ? (
        <Check className="size-2.5" />
      ) : partial ? (
        <Minus className="size-2.5" />
      ) : null}
    </span>
  );
}
