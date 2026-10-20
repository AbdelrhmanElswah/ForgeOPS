import {
  type GitHubInstallationList,
  GitHubInstallationListSchema,
  type InstallUrlResponse,
  InstallUrlResponseSchema,
} from '@forgeops/contracts';
import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';

import { AppConfig } from '../../../common/config/app-config.service.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { ApiProblemResponses, ApiZodResponse } from '../../../common/openapi/zod-openapi.js';
import { type AuthenticatedUser, CurrentUser, Public } from '../../auth/http/auth.decorators.js';
import type { InstallationRecord } from '../application/installations.repository.js';
import { InstallationService } from '../application/installation.service.js';

const CallbackQuerySchema = z.object({
  code: z.string().min(1).max(512),
  installation_id: z.coerce.number().int().positive(),
  setup_action: z.string().optional(),
  state: z.string().min(1).max(256).optional(),
});

@ApiTags('github')
@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly installations: InstallationService,
    private readonly config: AppConfig,
  ) {}

  @Get('install-url')
  @ApiOperation({ summary: 'Link to install the GitHub App (valid for 10 minutes, single use)' })
  @ApiZodResponse(200, InstallUrlResponseSchema)
  @ApiProblemResponses(401, 503)
  async installUrl(@CurrentUser() user: AuthenticatedUser): Promise<InstallUrlResponse> {
    return { url: await this.installations.createInstallUrl(user.id) };
  }

  @Get('installations')
  @ApiOperation({ summary: 'GitHub App installations connected to your account' })
  @ApiZodResponse(200, GitHubInstallationListSchema)
  @ApiProblemResponses(401)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<GitHubInstallationList> {
    const records = await this.installations.listForUser(user.id);
    return { items: records.map(toInstallationDto) };
  }

  /**
   * GitHub redirects the *browser* here after install + sign-in, so every outcome is a redirect
   * back to the dashboard, never a JSON error page. Public: identity comes from `state`.
   */
  @Public()
  @Get('oauth/callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = CallbackQuerySchema.safeParse(query);
    if (!parsed.success) {
      response.redirect(302, this.dashboardUrl('error', 'invalid_callback'));
      return;
    }
    const { code, installation_id: installationId, setup_action: setupAction, state } = parsed.data;

    // Changing the app's repository selection on github.com redirects here without our
    // `state`. Nothing to link: the installation_repositories webhook syncs the change.
    if (!state) {
      response.redirect(
        302,
        setupAction === 'update'
          ? this.dashboardUrl('updated')
          : this.dashboardUrl('error', 'missing_state'),
      );
      return;
    }

    try {
      await this.installations.completeInstallation({ state, code, installationId });
      response.redirect(302, this.dashboardUrl('connected'));
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ installationId, reason: error.code }, 'GitHub installation rejected');
        response.redirect(302, this.dashboardUrl('error', error.code));
        return;
      }
      this.logger.error({ err: error, installationId }, 'GitHub installation failed');
      response.redirect(302, this.dashboardUrl('error', 'internal_error'));
    }
  }

  private dashboardUrl(result: 'connected' | 'updated' | 'error', reason?: string): string {
    const url = new URL('/settings/integrations', this.config.get('WEB_ORIGIN'));
    url.searchParams.set('github', result);
    if (reason) url.searchParams.set('reason', reason);
    return url.toString();
  }
}

function toInstallationDto(record: InstallationRecord) {
  return {
    id: record.id,
    installationId: record.installationId,
    accountLogin: record.accountLogin,
    accountType: record.accountType,
    suspended: record.suspendedAt !== null,
    repositoryCount: record.repositoryCount,
    createdAt: record.createdAt.toISOString(),
  };
}
