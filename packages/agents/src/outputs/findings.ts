import { z } from 'zod';

/** What the investigator must return: a root cause backed by evidence from the code. */
export const FindingsSchema = z.object({
  rootCause: z.string().describe('The most likely cause, in plain language.'),
  evidence: z
    .array(
      z.object({
        path: z.string(),
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
        explanation: z.string().describe('Why these lines support the root cause.'),
      }),
    )
    .min(1)
    .max(20),
  filesToChange: z.array(z.string()).max(20),
  confidence: z
    .enum(['low', 'medium', 'high'])
    .describe('Low confidence routes the task to a human instead of guessing a fix.'),
});
export type Findings = z.infer<typeof FindingsSchema>;
