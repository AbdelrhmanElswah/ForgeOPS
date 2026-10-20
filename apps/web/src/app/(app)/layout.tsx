import type { ReactNode } from 'react';
import { SessionGate } from '@/features/auth';
import { AppShell } from '@/features/shell';

/** Every signed-in page: session check, then the app frame. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
