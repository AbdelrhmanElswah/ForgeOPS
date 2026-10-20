import { z } from 'zod';

import { PageQuerySchema, pageOf } from '../common/pagination.js';
import {
  CommitShaSchema,
  GitRefNameSchema,
  IdSchema,
  TimestampSchema,
} from '../common/primitives.js';

/**
 * Programs a repository's commands may start with. Phase 3 sandboxes target Node projects;
 * other toolchains get added here deliberately, together with their sandbox images.
 */
export const ALLOWED_PROGRAMS = ['npm', 'pnpm', 'yarn', 'npx', 'node'] as const;

const ArgumentSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((arg) => !/[\0\n\r]/.test(arg), 'Arguments may not contain control characters');

/**
 * A command as an argument vector, e.g. `["pnpm", "test", "--", "--reporter=junit"]`.
 * It is executed directly, never through `sh -c`, so `;`, `&&`, `|`, `$(…)` are inert
 * characters inside an argument rather than ways to chain a second command.
 */
export const CommandSchema = z
  .array(ArgumentSchema)
  .min(1)
  .max(20)
  .refine(
    ([program]) => (ALLOWED_PROGRAMS as readonly string[]).includes(program ?? ''),
    `The command must start with one of: ${ALLOWED_PROGRAMS.join(', ')}`,
  );
export type Command = z.infer<typeof CommandSchema>;

// Field rules without defaults: shared by the stored schema (which adds defaults) and the
// PATCH schema (which must not, or a partial update would reset the omitted limits).
const LIMIT_FIELDS = {
  maxFilesChanged: z.number().int().min(1).max(50),
  maxDiffLines: z.number().int().min(10).max(2000),
  testTimeoutSeconds: z.number().int().min(30).max(1800),
};

/** Guard rails for every run on this repository (enforced by the verifier in Phase 5). */
export const RepositoryLimitsSchema = z.object({
  maxFilesChanged: LIMIT_FIELDS.maxFilesChanged.default(10),
  maxDiffLines: LIMIT_FIELDS.maxDiffLines.default(400),
  testTimeoutSeconds: LIMIT_FIELDS.testTimeoutSeconds.default(300),
});
export type RepositoryLimits = z.infer<typeof RepositoryLimitsSchema>;

/** Gitignore-style path patterns the agents may never modify, on top of the built-in denylist. */
const DeniedPathSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((path) => !path.includes('\0'), 'Invalid path pattern');

/**
 * Human-controlled run settings. Stored as JSON; every field has a default, so an empty `{}`
 * (a freshly connected repository) parses into a complete, safe configuration.
 */
export const RepositorySettingsSchema = z.object({
  testCommand: CommandSchema.default(['npm', 'test']),
  /** Null: dependencies are not installed (only works for repos that vendor them). */
  installCommand: CommandSchema.nullable().default(['npm', 'ci']),
  limits: RepositoryLimitsSchema.default(RepositoryLimitsSchema.parse({})),
  deniedPaths: z.array(DeniedPathSchema).max(50).default([]),
});
export type RepositorySettings = z.infer<typeof RepositorySettingsSchema>;

/** Body of `PATCH /repositories/:id/settings`: only the fields to change; `limits` merges. */
export const UpdateRepositorySettingsRequestSchema = z.strictObject({
  testCommand: CommandSchema.optional(),
  installCommand: CommandSchema.nullable().optional(),
  limits: z.strictObject(LIMIT_FIELDS).partial().optional(),
  deniedPaths: z.array(DeniedPathSchema).max(50).optional(),
});
export type UpdateRepositorySettingsRequest = z.infer<typeof UpdateRepositorySettingsRequestSchema>;

export const RepositorySchema = z.object({
  id: IdSchema,
  githubRepoId: z.number().int().positive(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: GitRefNameSchema,
  isPrivate: z.boolean(),
  settings: RepositorySettingsSchema,
  createdAt: TimestampSchema,
});
export type Repository = z.infer<typeof RepositorySchema>;

export const ListRepositoriesQuerySchema = PageQuerySchema.extend({
  /** Case-insensitive match on owner or name. */
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListRepositoriesQuery = z.infer<typeof ListRepositoriesQuerySchema>;

export const RepositoryPageSchema = pageOf(RepositorySchema);
export type RepositoryPage = z.infer<typeof RepositoryPageSchema>;

export const BranchSchema = z.object({
  name: z.string(),
  commitSha: CommitShaSchema,
  isProtected: z.boolean(),
});
export const BranchListSchema = z.object({ items: z.array(BranchSchema) });
export type BranchList = z.infer<typeof BranchListSchema>;
