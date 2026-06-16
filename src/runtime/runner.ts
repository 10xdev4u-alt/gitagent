/**
 * The agent runner.
 *
 * The core loop that executes an agent against an event:
 *   1. Build messages (system prompt + memory + event)
 *   2. Call the LLM with the available tools
 *   3. If the LLM returns tool calls, execute them
 *   4. Add tool results to the messages and loop
 *   5. Stop when the LLM returns text only, or limits are hit
 */

import type { ChatMessage } from '../providers/types.js';
import type { ToolCall, ToolDefinition } from '../providers/types.js';
import { buildToolContext, resolveToolDefs, toLLMToolDefs, type RunContext, type RunResult } from './context.js';
import { estimateMessagesTokens } from './tokens.js';

export interface RunOptions {
  /** Abort signal. */
  signal?: AbortSignal;
}

/** Run a single agent against an event. */
export async function runAgent(rc: RunContext, options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now();
  const tools = resolveToolDefs(rc);
  const llmTools: ToolDefinition[] = toLLMToolDefs(tools);

  const messages = buildInitialMessages(rc);
  const toolExecutions: RunResult['toolExecutions'] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let steps = 0;
  let finalText = '';
  let stopReason: RunResult['stopReason'] = 'completed';
  let error: string | undefined;

  const maxSteps = rc.manifest.frontmatter.limits.maxSteps;
  const maxTotalTokens = rc.manifest.frontmatter.limits.maxTotalTokens;
  const timeoutMs = rc.manifest.frontmatter.limits.timeoutMs;
  const maxToolCalls = rc.manifest.frontmatter.limits.maxToolCalls;

  try {
    while (steps < maxSteps) {
      if (options.signal?.aborted) {
        stopReason = 'error';
        error = 'Aborted';
        break;
      }
      if (Date.now() - startedAt > timeoutMs) {
        stopReason = 'timeout';
        break;
      }
      if (usage.inputTokens + usage.outputTokens > maxTotalTokens) {
        stopReason = 'max_tokens';
        break;
      }
      if (toolExecutions.length >= maxToolCalls) {
        stopReason = 'max_steps';
        break;
      }

      steps++;
      const response = await rc.provider.chat(messages, {
        model: rc.manifest.frontmatter.model.name,
        temperature: rc.manifest.frontmatter.model.temperature,
        maxTokens: rc.manifest.frontmatter.model.maxTokens,
        tools: llmTools,
        signal: options.signal,
      });

      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;

      if (response.toolCalls.length === 0) {
        finalText = response.content;
        stopReason = 'completed';
        break;
      }

      // Add the assistant turn
      messages.push({
        role: 'assistant',
        content: response.content || '',
      });

      // Execute each tool call
      for (const tc of response.toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          toolExecutions.push({ name: tc.name, input: tc.input, output: null, ok: false, error: 'Tool not found' });
          messages.push({ role: 'user', content: `Tool "${tc.name}" not found. Available: ${tools.map((t) => t.name).join(', ')}` });
          continue;
        }

        // Validate input
        const parsed = tool.inputSchema.safeParse(tc.input);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          toolExecutions.push({ name: tc.name, input: tc.input, output: null, ok: false, error: `Invalid input: ${issues}` });
          messages.push({ role: 'user', content: `Tool "${tc.name}" rejected input: ${issues}. Please try again with corrected arguments.` });
          continue;
        }

        // Execute
        const toolCtx = buildToolContext(rc);
        try {
          const result = await tool.execute(parsed.data, toolCtx);
          toolExecutions.push({ name: tc.name, input: parsed.data, output: result.output, ok: result.ok, ...(result.error ? { error: result.error } : {}) });
          messages.push({
            role: 'user',
            content: result.ok
              ? `Tool "${tc.name}" succeeded. Result: ${JSON.stringify(result.output ?? null)}`
              : `Tool "${tc.name}" failed: ${result.error ?? 'unknown error'}. Please try a different approach.`,
          });
        } catch (err) {
          const message = (err as Error).message;
          toolExecutions.push({ name: tc.name, input: parsed.data, output: null, ok: false, error: message });
          messages.push({ role: 'user', content: `Tool "${tc.name}" threw: ${message}. Please try a different approach.` });
        }
      }
    }

    if (steps >= maxSteps && stopReason === 'completed') {
      stopReason = 'max_steps';
    }
  } catch (err) {
    stopReason = 'error';
    error = (err as Error).message;
  }

  return {
    ok: stopReason === 'completed' || stopReason === 'max_steps' || stopReason === 'max_tokens' || stopReason === 'timeout',
    finalText,
    toolExecutions,
    usage,
    steps,
    stopReason,
    ...(error ? { error } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Message building                                                    */
/* ------------------------------------------------------------------ */

function buildInitialMessages(rc: RunContext): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // System prompt: personality + manifest body
  const systemParts: string[] = [];
  if (rc.manifest.frontmatter.personality) {
    systemParts.push(rc.manifest.frontmatter.personality);
  }
  systemParts.push(formatToolInstructions(rc));
  messages.push({ role: 'system', content: systemParts.join('\n\n') });

  // Event context
  messages.push({
    role: 'user',
    content: formatEventContext(rc),
  });

  return messages;
}

function formatToolInstructions(rc: RunContext): string {
  const tools = resolveToolDefs(rc);
  if (tools.length === 0) {
    return 'You have no tools available. Respond with text only.';
  }
  const lines = ['You have access to the following tools:'];
  for (const t of tools) {
    lines.push(`- ${t.name}: ${t.description}`);
  }
  lines.push('');
  lines.push('When you need to perform an action, use a tool. When you are done, respond with plain text only (no tool calls).');
  return lines.join('\n');
}

function formatEventContext(rc: RunContext): string {
  const lines: string[] = [];
  lines.push(`# Event`);
  lines.push(`Event: ${rc.event.name}${rc.event.action ? ` (action: ${rc.event.action})` : ''}`);
  lines.push(`Repository: ${rc.repo.owner}/${rc.repo.name}`);
  lines.push(`Run ID: ${rc.runId}`);
  lines.push('');
  lines.push('## Payload');
  lines.push('```json');
  lines.push(JSON.stringify(rc.event.payload, null, 2).slice(0, 50_000));
  lines.push('```');
  return lines.join('\n');
}

// Helper to expose the token estimator for callers (so they can budget context).
export function _estimateRunContextTokens(rc: RunContext): number {
  const messages = buildInitialMessages(rc);
  return estimateMessagesTokens(messages);
}

/** A single tool call returned by the LLM. Re-exported for convenience. */
export type { ToolCall };
