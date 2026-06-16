/**
 * The agent run context.
 *
 * Everything the runner needs to execute an agent against a single event.
 * Built by the runtime from a manifest, an event payload, and shared
 * services (provider, tools, memory).
 */

import type { LLMProvider, TokenUsage, ToolDefinition } from '../providers/types.js';
import type { ToolContext, ToolDefinition as RuntimeToolDefinition } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Memory, SearchableMemory } from '../memory/types.js';
import type { GitHubEvent, Manifest } from '../manifest/schema.js';

export interface RunContext {
  /** The manifest being executed. */
  manifest: Manifest;
  /** The event that triggered this run. */
  event: {
    name: GitHubEvent | string;
    action?: string;
    payload: unknown;
  };
  /** The LLM provider to use. */
  provider: LLMProvider;
  /** The tool registry. */
  tools: ToolRegistry;
  /** The memory (could be GitMemory, InMemoryStore, etc.). */
  memory: Memory | SearchableMemory;
  /** GitHub repo context. */
  repo: { owner: string; name: string };
  /** Run id. */
  runId: string;
  /** Whether the run is in dry-run mode (no side effects). */
  dryRun: boolean;
  /** Logger. */
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

/** The result of a single agent run. */
export interface RunResult {
  /** Whether the run succeeded. */
  ok: boolean;
  /** Final assistant text (if any). */
  finalText: string;
  /** Tool calls executed. */
  toolExecutions: Array<{
    name: string;
    input: unknown;
    output: unknown;
    ok: boolean;
    error?: string;
  }>;
  /** Total token usage across all LLM calls. */
  usage: TokenUsage;
  /** Number of steps (LLM calls) executed. */
  steps: number;
  /** Why the run ended. */
  stopReason: 'completed' | 'max_steps' | 'max_tokens' | 'timeout' | 'error';
  /** Error, if any. */
  error?: string;
}

/** Helper to build a tool context from a run context and a particular event. */
export function buildToolContext(
  rc: RunContext,
  overrides: Partial<ToolContext> = {},
): ToolContext {
  return {
    agentName: rc.manifest.frontmatter.name,
    runId: rc.runId,
    repo: rc.repo,
    event: { name: rc.event.name, action: rc.event.action, payload: rc.event.payload },
    dryRun: rc.dryRun,
    logger: rc.logger,
    ...overrides,
  };
}

/** Resolve the tool definitions this agent is allowed to use. */
export function resolveToolDefs(rc: RunContext): RuntimeToolDefinition[] {
  const refs = rc.manifest.frontmatter.tools;
  const out: RuntimeToolDefinition[] = [];
  for (const ref of refs) {
    const name = typeof ref === 'string' ? ref : ref.name;
    const tool = rc.tools.get(name);
    if (!tool) {
      throw new Error(`Agent "${rc.manifest.frontmatter.name}" requested unknown tool "${name}"`);
    }
    out.push(tool);
  }
  return out;
}

/** Convert a list of runtime tool defs to LLM tool defs. */
export function toLLMToolDefs(defs: RuntimeToolDefinition[]): ToolDefinition[] {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.inputSchema as unknown as Record<string, unknown>,
  }));
}
