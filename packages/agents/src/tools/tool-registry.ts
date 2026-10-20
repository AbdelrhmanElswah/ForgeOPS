import type { LlmToolDefinition } from '../ports/llm.port.js';
import type { AgentRole } from '../roles.js';
import type { AgentTool } from './tool.js';

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** The set of tools available to a run, and the per-role view the model gets. */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(tools: readonly AgentTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: AgentTool): this {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(`Invalid tool name "${tool.name}" (use snake_case).`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is registered twice.`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Only the tools a role may use are even *shown* to the model. The executor checks the
   * role again, because the model can still name a tool it was never offered.
   */
  definitionsFor(role: AgentRole): LlmToolDefinition[] {
    return [...this.tools.values()]
      .filter((tool) => tool.roles.includes(role))
      .sort((a, b) => a.name.localeCompare(b.name)) // stable order keeps the prompt cacheable
      .map(({ name, description, input }) => ({ name, description, input }));
  }
}
