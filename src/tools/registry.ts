/**
 * The tool registry.
 *
 * Maps tool names to {@link ToolDefinition} instances. The agent runtime
 * looks up tools by name when the LLM emits a tool call.
 */

import { ManifestError } from '../manifest/errors.js';
import { toLLMTool, type ToolDefinition } from './types.js';

export class ToolRegistry {
  private readonly tools: Map<string, ToolDefinition> = new Map();

  /** Register a tool. Throws if a tool with the same name is already registered. */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new ManifestError(
        'INVALID_TOOL',
        `Tool "${tool.name}" is already registered`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /** Look up a tool by name. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Get a tool, throwing if not registered. */
  require(name: string): ToolDefinition {
    const t = this.tools.get(name);
    if (!t) throw new ManifestError('INVALID_TOOL', `Tool "${name}" is not registered`);
    return t;
  }

  /** List all registered tools. */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** List tool names. */
  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  /** Convert a set of tool names to LLM tool definitions. */
  toLLMTools(names: string[]): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    const out: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
    for (const n of names) {
      const t = this.tools.get(n);
      if (!t) throw new ManifestError('INVALID_TOOL', `Tool "${n}" is not registered`);
      out.push(toLLMTool(t));
    }
    return out;
  }
}
