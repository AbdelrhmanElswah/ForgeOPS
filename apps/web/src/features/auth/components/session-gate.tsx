'use client';

import type { User } from '@forgeops/contracts';
import { ErrorState, Skeleton } from '@forgeops/ui';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, use, useEffect } from 'react';

import { api, ApiError, LOGIN_PATH } from '@/shared';

import { useCurrentUser } from '../api';

const SessionContext = createContext<User | null>(null);

/** The signed-in user, inside a SessionGate. */
export function useSessionUser(): User {
  const user = use(SessionContext);
  if (!user) throw new Error('useSessionUser() must be used inside <SessionGate>');
  return user;
}

/**
 * Renders the app only for a signed-in user. Why here and not in Next.js Proxy: the access
 * cookie lives 15 minutes, while the session (refresh cookie) lives 30 days and is only sent to
 * the API's /auth path. A cookie check at the edge would bounce people with a perfectly valid
 * session to the login page. Asking the API (which refreshes the session transparently) is the
 * only correct answer, and the API remains the real authority either way.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { data: user, error, refetch } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (signedOut) {
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, router, pathname]);

  // Any request (not only this one) can discover that the session ended for good.
  useEffect(
    () =>
      api.onSessionExpired(() => {
        router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
      }),
    [router, pathname],
  );

  if (user) {
    return <SessionContext value={user}>{children}</SessionContext>;
  }
  if (error && !signedOut) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorState
          title="Could not reach ForgeOps"
          description="Check your connection and try again."
          traceId={error instanceof ApiError ? error.traceId : undefined}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }
  return (
    <div aria-busy className="flex min-h-dvh">
      <Skeleton className="hidden w-60 rounded-none md:block" />
      <div className="flex-1 space-y-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
