import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { NotFoundError, ValidationError } from '../errors/domain-error.js';
import { toProblemDetails } from './problem-details.mapper.js';

describe('toProblemDetails', () => {
  it('maps domain errors by code', () => {
    expect(toProblemDetails(new NotFoundError('Task'))).toMatchObject({
      status: 404,
      code: 'not_found',
      title: 'Not Found',
      detail: 'Task was not found.',
    });
  });

  it('includes field errors for validation failures', () => {
    const problem = toProblemDetails(
      new ValidationError([{ path: 'instruction', message: 'Too short' }]),
    );

    expect(problem).toMatchObject({ status: 400, code: 'validation_failed' });
    expect(problem.errors).toEqual([{ path: 'instruction', message: 'Too short' }]);
  });

  it('maps framework HTTP exceptions by status', () => {
    expect(toProblemDetails(new UnauthorizedException())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(toProblemDetails(new NotFoundException('Cannot GET /x'))).toMatchObject({
      status: 404,
      code: 'not_found',
      detail: 'Cannot GET /x',
    });
    expect(toProblemDetails(new BadRequestException(['a', 'b']))).toMatchObject({
      code: 'bad_request',
      detail: 'a; b',
    });
  });

  it('passes through exposed http-errors (e.g. malformed JSON)', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
    });

    expect(toProblemDetails(parseError)).toMatchObject({ status: 400, code: 'bad_request' });
  });

  it('hides the message of unexpected errors', () => {
    const problem = toProblemDetails(new Error('connection string postgres://user:pw@db'));

    expect(problem).toMatchObject({ status: 500, code: 'internal_error' });
    expect(JSON.stringify(problem)).not.toContain('postgres://');
  });
});
