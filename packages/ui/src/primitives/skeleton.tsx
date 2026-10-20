import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/** Placeholder with the shape of the content to come: no layout jump when data arrives. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  );
}
