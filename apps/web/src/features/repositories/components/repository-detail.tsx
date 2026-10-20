'use client';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Code,
  EmptyState,
  ErrorState,
  PageHeader,
  ResourceList,
  ResourceListSkeleton,
  ResourceRow,
  Skeleton,
} from '@forgeops/ui';
import { useParams } from 'next/navigation';

import { ApiError, traceIdOf } from '@/shared';

import { useBranches, useRepository } from '../api';
import { RepositorySettingsForm } from './repository-settings-form';

export function RepositoryDetail() {
  const { id } = useParams<{ id: string }>();
  const repository = useRepository(id);

  if (repository.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (repository.isError) {
    return repository.error instanceof ApiError && repository.error.status === 404 ? (
      <EmptyState
        title="Repository not found"
        description="It may have been removed from the GitHub App installation."
      />
    ) : (
      <ErrorState
        title="Could not load the repository"
        traceId={traceIdOf(repository.error)}
        onRetry={() => void repository.refetch()}
      />
    );
  }

  const { data } = repository;
  return (
    <>
      <PageHeader
        title={data.fullName}
        description={
          <span className="flex items-center gap-2">
            Default branch <Code>{data.defaultBranch}</Code>
            <Badge tone="neutral">{data.isPrivate ? 'Private' : 'Public'}</Badge>
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Run settings</CardTitle>
            <CardDescription>
              How ForgeOps installs, tests and limits changes in this repository.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RepositorySettingsForm repository={data} />
          </CardContent>
        </Card>
        <BranchesCard repositoryId={data.id} />
      </div>
    </>
  );
}

function BranchesCard({ repositoryId }: { repositoryId: string }) {
  const branches = useBranches(repositoryId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <CardDescription>Live from GitHub. A task starts from one of these.</CardDescription>
      </CardHeader>
      <CardContent>
        {branches.isPending ? (
          <ResourceListSkeleton rows={2} />
        ) : branches.isError ? (
          <ErrorState
            title="Could not load branches"
            description="GitHub may be unreachable, or the app is not configured on this server."
            traceId={traceIdOf(branches.error)}
            onRetry={() => void branches.refetch()}
          />
        ) : (
          <ResourceList aria-label="Branches">
            {branches.data.items.map((branch) => (
              <ResourceRow
                key={branch.name}
                title={<Code>{branch.name}</Code>}
                badges={branch.isProtected && <Badge tone="info">Protected</Badge>}
                meta={<span className="font-mono">{branch.commitSha.slice(0, 7)}</span>}
              />
            ))}
          </ResourceList>
        )}
      </CardContent>
    </Card>
  );
}
