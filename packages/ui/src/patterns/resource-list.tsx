import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Skeleton } from '../primitives/skeleton';

/** Loading placeholder shaped like a ResourceList, so nothing jumps when data arrives. */
export function ResourceListSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div aria-busy className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * A bordered list of resources (repositories, installations, tasks). One row design for every
 * list in the product, so lists look and behave the same everywhere.
 */
export function ResourceList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('divide-y rounded-lg border bg-card', className)} {...props} />;
}

export interface ResourceRowProps {
  /** Pass the app's link element here to make the row navigable (router-agnostic). */
  title: ReactNode;
  description?: ReactNode;
  /** Small secondary facts under the title: branch, counts, dates. */
  meta?: ReactNode;
  /** Status badges, shown next to the title. */
  badges?: ReactNode;
  /** Actions or a chevron, aligned right. */
  trailing?: ReactNode;
  className?: string;
}

export function ResourceRow({
  title,
  description,
  meta,
  badges,
  trailing,
  className,
}: ResourceRowProps) {
  return (
    <li className={cn('flex items-center gap-4 px-4 py-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badges}
        </div>
        {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
        {meta && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </li>
  );
}
