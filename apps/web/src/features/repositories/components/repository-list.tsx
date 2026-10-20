'use client';

import {
  Badge,
  Button,
  Code,
  EmptyState,
  ErrorState,
  ResourceList,
  ResourceListSkeleton,
  ResourceRow,
  SearchInput,
} from '@forgeops/ui';
import { ChevronRight, FolderGit2, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { traceIdOf, useDebouncedValue } from '@/shared';

import { useRepositories } from '../api';

export function RepositoryList() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const query = useRepositories(debouncedSearch);
  const repositories = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        label="Search repositories"
        placeholder="Search by owner or name"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        className="max-w-sm"
      />

      {query.isPending ? (
        <ResourceListSkeleton />
      ) : query.isError ? (
        <ErrorState
          title="Could not load repositories"
          traceId={traceIdOf(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : repositories.length === 0 ? (
        debouncedSearch ? (
          <EmptyState
            title="No matches"
            description={`No repository matches “${debouncedSearch}”.`}
          />
        ) : (
          <EmptyState
            icon={<FolderGit2 aria-hidden />}
            title="No repositories yet"
            description="Install the ForgeOps GitHub App on the repositories you want the agents to work on."
            action={
              <Button asChild>
                <Link href="/settings/integrations">Connect GitHub</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <ResourceList aria-label="Repositories">
            {repositories.map((repository) => (
              <ResourceRow
                key={repository.id}
                title={
                  <Link href={`/repositories/${repository.id}`} className="hover:underline">
                    {repository.fullName}
                  </Link>
                }
                badges={<Badge tone="neutral">{repository.isPrivate ? 'Private' : 'Public'}</Badge>}
                meta={
                  <span className="flex items-center gap-1">
                    <GitBranch aria-hidden className="size-3" />
                    <Code>{repository.defaultBranch}</Code>
                  </span>
                }
                trailing={<ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
              />
            ))}
          </ResourceList>
          {query.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
