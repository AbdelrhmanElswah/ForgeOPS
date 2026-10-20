import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';
import { Input } from '../primitives/input';

/**
 * A search box. `label` is required: an icon alone tells sighted users what the box is for,
 * but screen readers need words.
 */
export function SearchInput({
  label,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input type="search" aria-label={label} className="pl-9" {...props} />
    </div>
  );
}
