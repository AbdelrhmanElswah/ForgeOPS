import { ShellSkeleton } from '@forgeops/ui';
import { type ReactNode, Suspense } from 'react';

import { SessionGate } from '@/features/auth';
import { AppShell } from '@/features/shell';

/**
 * Every signed-in page: session check, then the app frame. The Suspense boundary is required
 * because the shell reads the current URL, which on dynamic routes (/repositories/[id]) is only
 * known per request; the skeleton shows in the meantime.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SessionGate>
        <AppShell>{children}</AppShell>
      </SessionGate>
    </Suspense>
  );
}
