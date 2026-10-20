/** The task statuses that correspond to graph nodes. */
export type RunStage = 'planning' | 'investigating' | 'implementing' | 'verifying';

/**
 * Port: called before each node runs. The backend implementation moves the task to the
 * stage's status (through the state machine) and throws RunCancelledError if the user asked
 * the task to stop. Entering the stage the task is already in must be a no-op: after a crash,
 * a resumed run re-enters the node that was interrupted.
 */
export interface StageGate {
  enter(stage: RunStage): Promise<void>;
}

export class RunCancelledError extends Error {
  constructor() {
    super('The task was cancelled.');
    this.name = 'RunCancelledError';
  }
}
