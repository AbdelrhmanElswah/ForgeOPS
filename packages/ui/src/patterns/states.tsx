import { CircleAlert, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

interface StateProps {
  title: string;
  description?: ReactNode;
  className?: string;
}

/** "Nothing here yet", always with a hint (or action) about what to do next. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: StateProps & { icon?: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground [&_svg]:size-8">{icon ?? <Inbox aria-hidden />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * A failed load. Shows the trace id when there is one, so a bug report maps straight to the
 * server's logs, and offers a retry when the caller can retry.
 */
export function ErrorState({
  title,
  description,
  traceId,
  onRetry,
  className,
}: StateProps & { traceId?: string | undefined; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 px-6 py-10 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden className="size-8 text-danger" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {traceId && <p className="font-mono text-xs text-muted-foreground">Reference: {traceId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
