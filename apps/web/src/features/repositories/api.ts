'use client';

import {
  BranchListSchema,
  type Repository,
  RepositoryPageSchema,
  RepositorySchema,
  type UpdateRepositorySettingsRequest,
} from '@forgeops/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toQueryString } from '@/shared';

export const repositoryKeys = {
  all: ['repositories'] as const,
  list: (search: string) => [...repositoryKeys.all, 'list', search] as const,
  detail: (id: string) => [...repositoryKeys.all, 'detail', id] as const,
  branches: (id: string) => [...repositoryKeys.all, 'branches', id] as const,
};

const PAGE_SIZE = 20;

/** Cursor pagination: each page knows the cursor of the next one. */
export function useRepositories(search: string) {
  return useInfiniteQuery({
    queryKey: repositoryKeys.list(search),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `/repositories${toQueryString({ limit: PAGE_SIZE, cursor: pageParam, search })}`,
        { schema: RepositoryPageSchema, signal },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useRepository(id: string) {
  return useQuery({
    queryKey: repositoryKeys.detail(id),
    queryFn: ({ signal }) =>
      api.request(`/repositories/${id}`, { schema: RepositorySchema, signal }),
  });
}

/** Branches come live from GitHub, so they are refetched more eagerly than repository data. */
export function useBranches(id: string) {
  return useQuery({
    queryKey: repositoryKeys.branches(id),
    queryFn: ({ signal }) =>
      api.request(`/repositories/${id}/branches`, { schema: BranchListSchema, signal }),
    staleTime: 10_000,
  });
}

export function useUpdateRepositorySettings(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRepositorySettingsRequest) =>
      api.request(`/repositories/${id}/settings`, {
        method: 'PATCH',
        body,
        schema: RepositorySchema,
      }),
    onSuccess: (repository: Repository) => {
      // The response is the updated repository: use it directly, no refetch needed.
      queryClient.setQueryData(repositoryKeys.detail(id), repository);
      void queryClient.invalidateQueries({ queryKey: [...repositoryKeys.all, 'list'] });
    },
  });
}
