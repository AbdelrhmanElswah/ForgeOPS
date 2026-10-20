import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';

/** Title row of every page: same spacing, heading level and action placement everywhere. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4 pb-6', className)}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Two-column application frame: navigation sidebar + scrollable content. */
export function Shell({
  sidebar,
  children,
  className,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-dvh', className)}>
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">{sidebar}</aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * A sidebar link. Router-agnostic: pass the app's link component as the child (asChild) and
 * whether it is the current page, so the design system never depends on a framework.
 *
 *   <NavItem active={pathname === '/tasks'}><Link href="/tasks"><ListIcon />Tasks</Link></NavItem>
 */
export function NavItem({
  active = false,
  className,
  ...props
}: ComponentProps<typeof Slot.Root> & { active?: boolean }) {
  return (
    <Slot.Root
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4',
        active && 'bg-muted font-medium text-foreground',
        className,
      )}
      {...props}
    />
  );
}
