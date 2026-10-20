import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RepositoryDetail } from '@/features/repositories';

export const metadata: Metadata = { title: 'Repository' };

// The id comes from the URL at runtime, so the detail renders inside a Suspense boundary.
export default function RepositoryPage() {
  return (
    <Suspense>
      <RepositoryDetail />
    </Suspense>
  );
}
