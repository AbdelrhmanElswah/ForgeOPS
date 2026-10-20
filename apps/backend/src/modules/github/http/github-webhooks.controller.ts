import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { UnauthenticatedError, ValidationError } from '../../../common/errors/domain-error.js';
import { Public, SkipCsrf } from '../../auth/http/auth.decorators.js';
import { GitHubAppClient } from '../application/github-app.client.js';
import {
  GitHubWebhookService,
  type WebhookOutcome,
} from '../application/github-webhook.service.js';

/**
 * Receives GitHub webhook deliveries. Public and CSRF-exempt because the caller is GitHub's
 * servers, not a browser; the HMAC signature is the authentication instead.
 */
@ApiExcludeController()
@Public()
@SkipCsrf()
@Controller('webhooks')
export class GitHubWebhooksController {
  constructor(
    private readonly github: GitHubAppClient,
    private readonly webhooks: GitHubWebhookService,
  ) {}

  @Post('github')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ outcome: WebhookOutcome }> {
    // Verify first, before looking at anything else in the request.
    if (!request.rawBody || !this.github.isValidWebhookSignature(request.rawBody, signature)) {
      throw new UnauthenticatedError('Invalid webhook signature.');
    }
    if (!event || !deliveryId || deliveryId.length > 100) {
      throw new ValidationError([
        { path: 'headers', message: 'x-github-event and x-github-delivery are required' },
      ]);
    }
    const body: unknown = request.body;
    return { outcome: await this.webhooks.handle({ event, deliveryId, payload: body }) };
  }
}
