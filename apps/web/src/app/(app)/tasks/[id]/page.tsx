import type { Metadata } from 'next';
import { Suspense } from 'react';

import { TaskDetail } from '@/features/tasks';

export const metadata: Metadata = { title: 'Task' };

// The id comes from the URL at runtime, so the detail renders inside a Suspense boundary.
export default function TaskPage() {
  return (
    <Suspense>
      <TaskDetail />
    </Suspense>
  );
}
