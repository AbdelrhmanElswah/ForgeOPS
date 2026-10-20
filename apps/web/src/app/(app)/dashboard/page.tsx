import { Button, EmptyState, PageHeader } from '@forgeops/ui';
import { FolderGit2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Dashboard' };

// Task statistics arrive in step 7.3; until then, the dashboard points to the first action.
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your tasks and their progress." />
      <EmptyState
        icon={<FolderGit2 aria-hidden />}
        title="No tasks yet"
        description="Connect a GitHub repository, then describe a bug or feature for the agents."
        action={
          <Button asChild>
            <Link href="/repositories">Connect a repository</Link>
          </Button>
        }
      />
    </>
  );
}
