import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthForm } from '@/features/auth';

export const metadata: Metadata = { title: 'Sign in' };

// The form reads ?next= from the URL, which needs a Suspense boundary during prerendering.
export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
