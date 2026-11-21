import { Card, CardContent, PageHeader } from '@forgeops/ui';
import type { Metadata } from 'next';

import { NewTaskForm } from '@/features/tasks';

export const metadata: Metadata = { title: 'New task' };

export default function NewTaskPage() {
  return (
    <>
      <PageHeader
        title="New task"
        description="The agents plan, investigate and propose a change. Nothing reaches GitHub until you approve it."
      />
      <Card>
        <CardContent className="pt-5">
          <NewTaskForm />
        </CardContent>
      </Card>
    </>
  );
}
