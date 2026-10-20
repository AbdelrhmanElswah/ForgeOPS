import { Body, type PipeTransform, Param, Query } from '@nestjs/common';
import type { z } from 'zod';

import { ValidationError } from '../errors/domain-error.js';

/**
 * Validates a request part against a Zod schema from @forgeops/contracts and hands the
 * handler the *parsed* value: defaults applied, strings trimmed, query numbers coerced.
 * The handler never sees raw, unvalidated input.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || '(root)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}

/** `@ZodBody(CreateTaskRequestSchema) body: CreateTaskRequest` */
export const ZodBody = (schema: z.ZodType): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));

/** `@ZodQuery(ListTasksQuerySchema) query: ListTasksQuery` */
export const ZodQuery = (schema: z.ZodType): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));

/** `@ZodParam('id', IdSchema) id: string` */
export const ZodParam = (name: string, schema: z.ZodType): ParameterDecorator =>
  Param(name, new ZodValidationPipe(schema));
