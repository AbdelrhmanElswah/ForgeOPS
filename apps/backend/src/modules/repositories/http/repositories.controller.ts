import {
  type BranchList,
  BranchListSchema,
  IdSchema,
  type ListRepositoriesQuery,
  ListRepositoriesQuerySchema,
  type Repository,
  RepositoryPageSchema,
  type RepositoryPage,
  RepositorySchema,
  type UpdateRepositorySettingsRequest,
  UpdateRepositorySettingsRequestSchema,
} from '@forgeops/contracts';
import { Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiProblemResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/openapi/zod-openapi.js';
import { ZodBody, ZodParam, ZodQuery } from '../../../common/validation/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser } from '../../auth/http/auth.decorators.js';
import { RepositoriesService } from '../application/repositories.service.js';

@ApiTags('repositories')
@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Repositories you have connected through the GitHub App' })
  @ApiZodQuery(ListRepositoriesQuerySchema)
  @ApiZodResponse(200, RepositoryPageSchema)
  @ApiProblemResponses(400, 401)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @ZodQuery(ListRepositoriesQuerySchema) query: ListRepositoriesQuery,
  ): Promise<RepositoryPage> {
    return this.repositories.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Repository details and effective settings' })
  @ApiZodResponse(200, RepositorySchema)
  @ApiProblemResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Repository> {
    return this.repositories.get(user.id, id);
  }

  @Get(':id/branches')
  @ApiOperation({ summary: 'Branches, live from GitHub' })
  @ApiZodResponse(200, BranchListSchema)
  @ApiProblemResponses(400, 401, 404, 503)
  branches(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<BranchList> {
    return this.repositories.listBranches(user.id, id);
  }

  @Patch(':id/settings')
  @ApiOperation({ summary: 'Update run settings (test command, limits, denied paths)' })
  @ApiZodBody(UpdateRepositorySettingsRequestSchema)
  @ApiZodResponse(200, RepositorySchema)
  @ApiProblemResponses(400, 401, 403, 404)
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateRepositorySettingsRequestSchema) body: UpdateRepositorySettingsRequest,
  ): Promise<Repository> {
    return this.repositories.updateSettings(user.id, id, body);
  }
}
