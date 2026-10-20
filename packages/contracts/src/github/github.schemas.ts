import { z } from 'zod';

import { IdSchema, TimestampSchema } from '../common/primitives.js';

export const GitHubAccountTypeSchema = z.enum(['User', 'Organization']);

/** A GitHub App installation linked to the signed-in ForgeOps user. */
export const GitHubInstallationSchema = z.object({
  id: IdSchema,
  /** GitHub's numeric installation id. */
  installationId: z.number().int().positive(),
  accountLogin: z.string(),
  accountType: GitHubAccountTypeSchema,
  suspended: z.boolean(),
  repositoryCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});
export type GitHubInstallation = z.infer<typeof GitHubInstallationSchema>;

export const GitHubInstallationListSchema = z.object({
  items: z.array(GitHubInstallationSchema),
});
export type GitHubInstallationList = z.infer<typeof GitHubInstallationListSchema>;

/** `GET /api/v1/github/install-url`: where the dashboard sends the user to install the app. */
export const InstallUrlResponseSchema = z.object({ url: z.url() });
export type InstallUrlResponse = z.infer<typeof InstallUrlResponseSchema>;

/**
 * Outcome the API appends to the dashboard URL after the install callback
 * (`/settings/integrations?github=connected`), so the UI can show the right message.
 */
export const GITHUB_CONNECT_RESULTS = ['connected', 'updated', 'error'] as const;
