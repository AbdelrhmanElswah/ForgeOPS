import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/** Inline machine text: commands, paths, branch names, commit SHAs. */
export function Code({ className, ...props }: ComponentProps<'code'>) {
  return (
    <code
      className={cn('rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em]', className)}
      {...props}
    />
  );
}
