import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';
import { GitHubWebhookService } from './application/github-webhook.service.js';
import { InstallationService } from './application/installation.service.js';
import { InstallationsRepository } from './application/installations.repository.js';
import { GitHubModule } from './github.module.js';
import { GitHubController } from './http/github.controller.js';
import { GitHubWebhooksController } from './http/github-webhooks.controller.js';
import { PrismaInstallationsRepository } from './infrastructure/prisma-installations.repository.js';

/**
 * The HTTP-facing GitHub features (install flow, webhooks): API process only.
 * The Worker imports just GitHubModule (the client), since it never serves these routes.
 */
@Module({
  imports: [GitHubModule, UsersModule],
  controllers: [GitHubController, GitHubWebhooksController],
  providers: [
    InstallationService,
    GitHubWebhookService,
    { provide: InstallationsRepository, useClass: PrismaInstallationsRepository },
  ],
})
export class GitHubIntegrationModule {}
