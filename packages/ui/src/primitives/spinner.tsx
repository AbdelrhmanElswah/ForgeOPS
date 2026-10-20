import { LoaderCircle } from 'lucide-react';

import { cn } from '../lib/cn';

/**
 * @param label Announced to screen readers. Pass "" when the surrounding element already
 *              conveys the state (e.g. a busy button), so it isn't read twice.
 */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={cn('size-4 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
