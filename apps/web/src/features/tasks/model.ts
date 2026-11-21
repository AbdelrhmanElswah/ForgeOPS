import {
  ACTIVE_TASK_STATUSES,
  isTerminalStatus,
  type TaskEvent,
  type TaskStatus,
} from '@forgeops/contracts';
import type { Tone } from '@forgeops/ui';

/** Task status → badge, defined once so a status looks the same on every screen. */
const STATUS_TONE: Record<TaskStatus, Tone> = {
  queued: 'neutral',
  planning: 'info',
  investigating: 'info',
  implementing: 'info',
  verifying: 'info',
  awaiting_approval: 'warning',
  publishing: 'info',
  completed: 'success',
  rejected: 'neutral',
  failed: 'danger',
  cancelled: 'neutral',
};

export function statusTone(status: TaskStatus): Tone {
  return STATUS_TONE[status];
}

/** "awaiting_approval" → "Awaiting approval" (also node and role names). */
export function statusLabel(status: string): string {
  const words = status.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Agents are working right now: the badge pulses. */
export function isWorking(status: TaskStatus): boolean {
  return (ACTIVE_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

/** The API refuses to cancel a finished task, so the button is not offered. */
export function canCancel(task: { status: TaskStatus; cancelRequestedAt: string | null }): boolean {
  return !isTerminalStatus(task.status) && task.cancelRequestedAt === null;
}

export interface EventView {
  title: string;
  detail?: string;
  tone: Tone;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Timeline event → one line of text, defined once (a switch, so new event types fail to compile). */
export function describeEvent(event: TaskEvent): EventView {
  switch (event.type) {
    case 'status.changed':
      return {
        title: `Status: ${statusLabel(event.status)}`,
        ...(event.failureReason && { detail: statusLabel(event.failureReason) }),
        tone: statusTone(event.status),
      };
    case 'node.started':
      return { title: `${statusLabel(event.node)} started`, tone: 'info' };
    case 'node.completed':
      return {
        title: `${statusLabel(event.node)} finished`,
        detail: seconds(event.durationMs),
        tone: 'neutral',
      };
    case 'llm.called':
      return {
        title: `${statusLabel(event.role)} asked ${event.model}`,
        detail: [
          `${event.inputTokens.toLocaleString()} in / ${event.outputTokens.toLocaleString()} out tokens`,
          event.costUsd !== null && `$${event.costUsd.toFixed(4)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'neutral',
      };
    case 'tool.called':
      return {
        title: `${statusLabel(event.role)} used ${event.tool}`,
        detail: [seconds(event.durationMs), event.error].filter(Boolean).join(' · '),
        tone: event.ok ? 'neutral' : 'danger',
      };
  }
}

/** Dashboard groups: what needs the user, what is running, how runs ended. */
export const STAT_GROUPS = [
  { label: 'Needs your approval', tone: 'warning', statuses: ['awaiting_approval'] },
  { label: 'In progress', tone: 'info', statuses: ['queued', ...ACTIVE_TASK_STATUSES] },
  { label: 'Completed', tone: 'success', statuses: ['completed'] },
  { label: 'Failed', tone: 'danger', statuses: ['failed'] },
] as const satisfies readonly { label: string; tone: Tone; statuses: readonly TaskStatus[] }[];

export function sumStatuses(
  byStatus: Record<TaskStatus, number>,
  statuses: readonly TaskStatus[],
): number {
  return statuses.reduce((total, status) => total + byStatus[status], 0);
}
