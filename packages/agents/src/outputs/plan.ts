import { z } from 'zod';

/**
 * What the planner must return. The model fills this shape through structured outputs and
 * the result is validated again with Zod: nothing downstream ever handles free-form text.
 */
export const PlanSchema = z.object({
  goal: z.string().describe('One sentence: the outcome the task asks for.'),
  steps: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
      }),
    )
    .min(1)
    .max(10)
    .describe('Ordered investigation and implementation steps.'),
  suspectedAreas: z
    .array(
      z.object({
        path: z.string().describe('Repository-relative file or directory path.'),
        reason: z.string(),
      }),
    )
    .max(20)
    .describe('Where in the code the cause or change most likely lives.'),
  acceptanceCriteria: z
    .array(z.string())
    .min(1)
    .max(10)
    .describe('Checkable conditions that mean the task is done, e.g. a test that must pass.'),
});
export type Plan = z.infer<typeof PlanSchema>;
