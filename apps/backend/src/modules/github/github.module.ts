import { Logger, Module } from '@nestjs/common';

import { AppConfig } from '../../common/config/app-config.service.js';
import { GitHubAppClient } from './application/github-app.client.js';
import { loadGitHubAppCredentials } from './infrastructure/github-app.credentials.js';
import { OctokitGitHubAppClient } from './infrastructure/octokit-github-app.client.js';
import { UnconfiguredGitHubAppClient } from './infrastructure/unconfigured-github-app.client.js';

@Module({
  providers: [
    {
      provide: GitHubAppClient,
      inject: [AppConfig],
      useFactory: (config: AppConfig): GitHubAppClient => {
        const credentials = loadGitHubAppCredentials({
          GITHUB_APP_ID: config.get('GITHUB_APP_ID'),
          GITHUB_APP_SLUG: config.get('GITHUB_APP_SLUG'),
          GITHUB_APP_CLIENT_ID: config.get('GITHUB_APP_CLIENT_ID'),
          GITHUB_APP_CLIENT_SECRET: config.get('GITHUB_APP_CLIENT_SECRET'),
          GITHUB_APP_PRIVATE_KEY: config.get('GITHUB_APP_PRIVATE_KEY'),
          GITHUB_APP_PRIVATE_KEY_PATH: config.get('GITHUB_APP_PRIVATE_KEY_PATH'),
          GITHUB_WEBHOOK_SECRET: config.get('GITHUB_WEBHOOK_SECRET'),
        });
        if (!credentials) {
          new Logger('GitHub').warn(
            'No GitHub App configured; GitHub features are disabled. Run `pnpm github:create-app`.',
          );
          return new UnconfiguredGitHubAppClient();
        }
        return new OctokitGitHubAppClient(credentials);
      },
    },
  ],
  exports: [GitHubAppClient],
})
export class GitHubModule {}
