import { Button, PageHeader } from '@forgeops/ui';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TaskList } from '@/features/tasks';

export const metadata: Metadata = { title: 'Tasks' };

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything you asked the agents to do, newest first."
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus aria-hidden />
              New task
            </Link>
          </Button>
        }
      />
      <TaskList />
    </>
  );
}
