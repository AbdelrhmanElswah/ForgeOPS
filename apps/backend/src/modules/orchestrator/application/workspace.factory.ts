import type { WorkspaceReader } from '@forgeops/agents';

import type { RepositoryRecord } from '../../repositories/application/repositories.repository.js';

export interface OpenWorkspace {
  reader: WorkspaceReader;
  /** Always called when the run ends (success, failure or cancellation). */
  close(): Promise<void>;
}

/**
 * Port: materialise a repository at an exact commit for one task run.
 * Phase 3 implements it with a sandboxed Docker clone; tests use an in-memory repository.
 */
export abstract class WorkspaceFactory {
  abstract open(input: {
    taskId: string;
    repository: RepositoryRecord;
    commitSha: string;
  }): Promise<OpenWorkspace>;
}

export class SandboxUnavailableError extends Error {
  constructor(message = 'The sandbox is not available on this server yet.') {
    super(message);
    this.name = 'SandboxUnavailableError';
  }
}
