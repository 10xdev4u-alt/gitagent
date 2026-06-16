/**
 * The tool interface.
 *
 * A tool is a function the agent can invoke during a run. Tools have:
 *   - A name (used to invoke them)
 *   - A description (shown to the LLM)
 *   - A JSON Schema describing their input
 *   - An `execute` function that takes parsed input and returns output
 *
 * Tools are registered with the {@link ToolRegistry} and exposed to the
 * agent at runtime.
 */

import { z } from 'zod';

/** The result of a tool execution. */
export interface ToolResult {
  /** Whether the tool succeeded. */
  ok: boolean;
  /** The output (a JSON-serializable value). */
  output?: unknown;
  /** An error message, if any. */
  error?: string;
  /** Whether this tool execution required approval. */
  requiredApproval?: boolean;
}

/** A single tool definition. */
export interface ToolDefinition {
  /** Tool name. Must be unique within a registry. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Zod schema for the tool's input. */
  inputSchema: z.ZodType<unknown>;
  /** The function to execute. */
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}

/** Context passed to every tool execution. */
export interface ToolContext {
  /** The agent's name. */
  agentName: string;
  /** The current run id. */
  runId: string;
  /** The GitHub repo context (owner/name). */
  repo: { owner: string; name: string };
  /** The event that triggered the run. */
  event: { name: string; action?: string; payload: unknown };
  /** Whether the tool execution is in dry-run mode (no side effects). */
  dryRun: boolean;
  /** Logger. */
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

/** Convert a Zod schema to a JSON Schema object for LLM tool definitions. */
export function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // zod's built-in toJSONSchema isn't available across all versions; build a minimal one.
  const def = (schema as unknown as { _def: { typeName: string; innerType?: z.ZodType<unknown>; value?: unknown; values?: unknown[]; shape?: () => Record<string, z.ZodType<unknown>> } })._def;
  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.innerType ?? z.unknown()) };
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!(value as unknown as { isOptional?: () => boolean }).isOptional?.()) {
          required.push(key);
        }
      }
      const result: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) result.required = required;
      return result;
    }
    case 'ZodEnum':
      return { type: 'string', enum: def.values ?? [] };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodUnion': {
      // best effort: use first option
      const opts = (schema as unknown as { _def: { options: z.ZodType<unknown>[] } })._def.options;
      return { anyOf: opts.map((o) => zodToJsonSchema(o)) };
    }
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType ?? z.unknown());
    case 'ZodNullable':
      return { ...zodToJsonSchema(def.innerType ?? z.unknown()), nullable: true };
    default:
      return {};
  }
}

/** Format a tool definition for the LLM (matches the standard "function" shape). */
export function toLLMTool(definition: ToolDefinition): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: zodToJsonSchema(definition.inputSchema),
  };
}
