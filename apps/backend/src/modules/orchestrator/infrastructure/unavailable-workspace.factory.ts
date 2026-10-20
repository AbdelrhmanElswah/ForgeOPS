import { SandboxUnavailableError, WorkspaceFactory } from '../application/workspace.factory.js';

/**
 * Placeholder until the Docker sandbox exists (roadmap Phase 3). Tasks fail with a clear
 * `sandbox_error` instead of the worker pretending it can read the repository.
 */
export class UnavailableWorkspaceFactory extends WorkspaceFactory {
  open(): Promise<never> {
    return Promise.reject(new SandboxUnavailableError());
  }
}
