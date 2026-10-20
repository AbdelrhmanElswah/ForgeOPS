import type { AgentRole } from '@forgeops/agents';
import { ClaudeLlmClient, type RoleModel } from '@forgeops/agents/llm/anthropic';
import { Module } from '@nestjs/common';

import { AppConfig } from '../../common/config/app-config.service.js';
import { EventsModule } from '../events/events.module.js';
import { GitHubModule } from '../github/github.module.js';
import { RepositoriesModule } from '../repositories/repositories.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { AgentOrchestratorService } from './application/agent-orchestrator.service.js';
import { WorkspaceFactory } from './application/workspace.factory.js';
import { AgentRunProcessor } from './infrastructure/agent-run.processor.js';
import { CheckpointerHost } from './infrastructure/checkpointer.provider.js';
import { UnavailableWorkspaceFactory } from './infrastructure/unavailable-workspace.factory.js';
import { CHECKPOINTER, LLM_CLIENT } from './orchestrator.tokens.js';

/** Worker process only: consumes the queue and runs the agents. */
@Module({
  imports: [TasksModule, RepositoriesModule, GitHubModule, EventsModule],
  providers: [
    AgentOrchestratorService,
    AgentRunProcessor,
    CheckpointerHost,
    {
      provide: CHECKPOINTER,
      inject: [CheckpointerHost],
      useFactory: (host: CheckpointerHost) => host.saver,
    },
    { provide: WorkspaceFactory, useClass: UnavailableWorkspaceFactory },
    {
      provide: LLM_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const role = (override: string | undefined): RoleModel => ({
          model: override ?? config.get('LLM_MODEL'),
          effort: config.get('LLM_EFFORT'),
        });
        const models: Record<AgentRole, RoleModel> = {
          planner: role(config.get('LLM_MODEL_PLANNER')),
          investigator: role(config.get('LLM_MODEL_INVESTIGATOR')),
          implementer: role(config.get('LLM_MODEL_IMPLEMENTER')),
          reviewer: role(config.get('LLM_MODEL_REVIEWER')),
        };
        return new ClaudeLlmClient({ models });
      },
    },
  ],
  exports: [AgentOrchestratorService],
})
export class OrchestratorModule {}
