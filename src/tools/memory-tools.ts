/**
 * Memory tools exposed to agents.
 *
 * An agent can read its memory, write to it, and search it. These are
 * the primitives the agent uses to learn from past runs.
 */

import { z } from 'zod';
import type { Memory, SearchableMemory } from '../memory/types.js';
import { ToolError } from './errors.js';
import type { ToolDefinition } from './types.js';

export function makeMemoryReadTool(memory: Memory): ToolDefinition {
  return {
    name: 'memory.read',
    description: 'Read a single entry from the agent\'s persistent memory by key.',
    inputSchema: z.object({
      key: z.string().min(1).describe('The memory key (e.g. "episodes/2026-01-15-issue-42")'),
    }),
    execute: async (input) => {
      const args = input as { key: string };
      const entry = await memory.read(args.key);
      if (!entry) {
        return { ok: true, output: { found: false, key: args.key } };
      }
      return {
        ok: true,
        output: {
          found: true,
          key: entry.key,
          content: entry.content,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt,
        },
      };
    },
  };
}

export function makeMemoryWriteTool(memory: Memory): ToolDefinition {
  return {
    name: 'memory.write',
    description: 'Write a value to the agent\'s persistent memory. Overwrites if the key exists.',
    inputSchema: z.object({
      key: z.string().min(1).describe('The memory key'),
      content: z.string().min(1).describe('The content to store'),
      metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata'),
    }),
    execute: async (input) => {
      const args = input as { key: string; content: string; metadata?: Record<string, unknown> };
      try {
        const entry = await memory.write(args.key, args.content, { metadata: args.metadata });
        return { ok: true, output: { key: entry.key, createdAt: entry.createdAt, updatedAt: entry.updatedAt } };
      } catch (err) {
        throw new ToolError('memory.write', 'EXECUTION_FAILED', `Failed to write memory: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeMemoryListTool(memory: Memory): ToolDefinition {
  return {
    name: 'memory.list',
    description: 'List all memory entries, optionally filtered by a key prefix.',
    inputSchema: z.object({
      prefix: z.string().optional().describe('Only return entries whose key starts with this prefix'),
      limit: z.number().int().positive().max(1000).default(100).describe('Max entries to return'),
    }),
    execute: async (input) => {
      const args = input as { prefix?: string; limit: number };
      const all = await memory.list(args.prefix);
      return {
        ok: true,
        output: {
          count: all.length,
          entries: all.slice(0, args.limit).map((e) => ({ key: e.key, preview: e.content.slice(0, 200), updatedAt: e.updatedAt })),
        },
      };
    },
  };
}

export function makeMemorySearchTool(memory: SearchableMemory): ToolDefinition {
  return {
    name: 'memory.search',
    description: 'Search memory for entries semantically similar to the query. Returns ranked results.',
    inputSchema: z.object({
      query: z.string().min(1).describe('The search query in natural language'),
      limit: z.number().int().positive().max(50).default(5).describe('Max results'),
      minScore: z.number().min(0).max(1).default(0.0).describe('Minimum similarity score (0-1)'),
    }),
    execute: async (input) => {
      const args = input as { query: string; limit: number; minScore: number };
      const results = await memory.search(args.query, { limit: args.limit, minScore: args.minScore });
      return {
        ok: true,
        output: {
          count: results.length,
          results: results.map((r) => ({ key: r.key, score: r.score, preview: r.content.slice(0, 200) })),
        },
      };
    },
  };
}
