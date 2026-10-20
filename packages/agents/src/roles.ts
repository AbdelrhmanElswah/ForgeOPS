/**
 * Agents are roles (prompt + tools + output schema) sharing one graph, not separate programs.
 * Each role can run on its own model and effort level (see the LLM adapter configuration).
 */
export const AGENT_ROLES = ['planner', 'investigator', 'implementer', 'reviewer'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
