import { Button, PageHeader } from '@forgeops/ui';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TaskList, TaskStats } from '@/features/tasks';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your tasks and their progress."
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus aria-hidden />
              New task
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <TaskStats />
        <TaskList />
      </div>
    </>
  );
}
