import { PROBLEM_CONTENT_TYPE } from '@forgeops/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { toProblemDetails } from './problem-details.mapper.js';

/**
 * Global exception filter: every error that escapes a controller leaves the API in the
 * same shape (`application/problem+json`), stamped with the request id so a user's bug
 * report maps straight to our log lines.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Set by pino-http's genReqId (logging.options.ts), which always produces a string.
    const traceId = typeof request.id === 'string' ? request.id : undefined;
    const problem = {
      ...toProblemDetails(exception),
      instance: request.originalUrl,
      ...(traceId && { traceId }),
    };

    if (problem.status >= 500) {
      // The full error (with stack) goes to the logs, never to the client.
      this.logger.error({ err: exception, traceId: problem.traceId }, 'Unhandled exception');
    }

    if (response.headersSent) {
      return;
    }
    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}
