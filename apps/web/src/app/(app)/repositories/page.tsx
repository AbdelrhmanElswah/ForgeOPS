import { PageHeader } from '@forgeops/ui';
import type { Metadata } from 'next';

import { RepositoryList } from '@/features/repositories';

export const metadata: Metadata = { title: 'Repositories' };

export default function RepositoriesPage() {
  return (
    <>
      <PageHeader
        title="Repositories"
        description="Repositories the ForgeOps GitHub App can access. Open one to set how it is tested."
      />
      <RepositoryList />
    </>
  );
}
