'use client';

import { GitHubInstallationListSchema, InstallUrlResponseSchema } from '@forgeops/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/shared';

export const integrationKeys = {
  installations: ['integrations', 'github', 'installations'] as const,
};

export function useInstallations() {
  return useQuery({
    queryKey: integrationKeys.installations,
    queryFn: ({ signal }) =>
      api.request('/github/installations', { schema: GitHubInstallationListSchema, signal }),
  });
}

/**
 * Asks the API for a fresh, single-use install link (it carries the `state` that proves this
 * browser started the flow), then leaves for github.com. A mutation, not a query: every click
 * must get a new link, and nothing about it should be cached.
 */
export function useStartGitHubInstall() {
  return useMutation({
    mutationFn: () => api.request('/github/install-url', { schema: InstallUrlResponseSchema }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}
