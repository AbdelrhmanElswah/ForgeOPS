import type { ReactNode } from 'react';
import { Hammer } from 'lucide-react';

/** Signed-out pages: a centred card, no app chrome. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <Hammer aria-hidden className="size-5 text-primary" />
        ForgeOps
      </p>
      {children}
    </main>
  );
}
