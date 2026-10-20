import { Module } from '@nestjs/common';

import { GitHubModule } from '../github/github.module.js';
import { RepositoriesRepository } from './application/repositories.repository.js';
import { RepositoriesService } from './application/repositories.service.js';
import { RepositoriesController } from './http/repositories.controller.js';
import { PrismaRepositoriesRepository } from './infrastructure/prisma-repositories.repository.js';

@Module({
  imports: [GitHubModule],
  controllers: [RepositoriesController],
  providers: [
    RepositoriesService,
    { provide: RepositoriesRepository, useClass: PrismaRepositoriesRepository },
  ],
  exports: [RepositoriesService, RepositoriesRepository],
})
export class RepositoriesModule {}
