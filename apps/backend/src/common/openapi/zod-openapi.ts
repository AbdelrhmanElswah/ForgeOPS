import { ProblemDetailsSchema } from '@forgeops/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Bridges Zod contracts into Swagger, so the docs are generated from the same schemas that
 * validate requests and can never drift from them.
 * `io: 'input'` describes what a client sends (defaults are optional);
 * `io: 'output'` describes what the server returns (defaults are always present).
 */
export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output'): SchemaObject {
  const { $schema: _ignored, ...openApi } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  return openApi as SchemaObject;
}

export const ApiZodBody = (schema: z.ZodType): MethodDecorator =>
  ApiBody({ schema: toOpenApiSchema(schema, 'input') });

/** Documents each property of a Zod object schema as a query parameter. */
export const ApiZodQuery = (schema: z.ZodObject): MethodDecorator => {
  const { properties = {}, required = [] } = toOpenApiSchema(schema, 'input');
  return applyDecorators(
    ...Object.entries(properties).map(([name, property]) =>
      ApiQuery({ name, required: required.includes(name), schema: property as SchemaObject }),
    ),
  );
};

export const ApiZodResponse = (
  status: number,
  schema: z.ZodType,
  description?: string,
): MethodDecorator & ClassDecorator =>
  ApiResponse({
    status,
    ...(description && { description }),
    schema: toOpenApiSchema(schema, 'output'),
  });

/** Documents the problem+json error responses an endpoint can return. */
export const ApiProblemResponses = (...statuses: number[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        content: {
          'application/problem+json': { schema: toOpenApiSchema(ProblemDetailsSchema, 'output') },
        },
      }),
    ),
  );
