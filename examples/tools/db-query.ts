/**
 * Example custom tool: query a Postgres database.
 *
 * Demonstrates how to write a custom tool that integrates with a
 * database. The Postgres client isn't bundled with gitagent; this
 * file is a pattern, not a working implementation.
 *
 * To make this work in your repo:
 * 1. Add `pg` to your dependencies
 * 2. Set the `DATABASE_URL` env var
 * 3. Register the tool in your agent's `tools:` list:
 *    ```yaml
 *    tools:
 *      - db.query
 *    ```
 */

import { z } from 'zod';
import { ToolError } from '../errors.js';
import type { ToolDefinition } from '../types.js';

export interface DbToolOptions {
  connectionString: string;
  /** Max rows returned (default 100). */
  maxRows?: number;
  /** Statement timeout in ms (default 5000). */
  statementTimeoutMs?: number;
}

let cachedPg: unknown = null;

async function loadPg(): Promise<unknown> {
  if (cachedPg) return cachedPg;
  try {
    cachedPg = await import('pg');
    return cachedPg;
  } catch (err) {
    throw new ToolError(
      'db.query',
      'TOOL_NOT_FOUND',
      'pg is not installed. Run `npm install pg` to add it.',
      { cause: err },
    );
  }
}

/**
 * Create a `db.query` tool that runs a read-only SQL query.
 *
 * WARNING: This tool accepts raw SQL. Only use it in trusted contexts.
 * For untrusted contexts, use a sandbox or explicit allow-list.
 */
export function makeDbQueryTool(options: DbToolOptions): ToolDefinition {
  const maxRows = options.maxRows ?? 100;
  const statementTimeoutMs = options.statementTimeoutMs ?? 5000;

  return {
    name: 'db.query',
    description: 'Run a read-only SQL query against the database. Returns up to maxRows rows.',
    inputSchema: z.object({
      sql: z.string().min(1).describe('A read-only SQL query (SELECT only)'),
      params: z.array(z.unknown()).default([]).describe('Bound parameters for the query'),
    }),
    execute: async (input, ctx) => {
      const args = input as { sql: string; params: unknown[] };

      // Safety: only allow SELECT statements
      const trimmed = args.sql.trim().toLowerCase();
      if (!trimmed.startsWith('select') && !trimmed.startsWith('with')) {
        return { ok: false, error: 'Only SELECT (or WITH ... SELECT) queries are allowed' };
      }
      if (/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i.test(args.sql)) {
        return { ok: false, error: 'DML/DDL statements are not allowed' };
      }

      if (ctx.dryRun) {
        return { ok: true, output: { dryRun: true, sql: args.sql, rowCount: 0 } };
      }
      try {
        const pg = (await loadPg()) as { Client: new (opts: { connectionString: string; statement_timeout: number }) => { connect: () => Promise<void>; query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>; end: () => Promise<void> } };
        const client = new pg.Client({ connectionString: options.connectionString, statement_timeout: statementTimeoutMs });
        await client.connect();
        try {
          const result = await client.query(args.sql, args.params);
          const rows = result.rows.slice(0, maxRows);
          return {
            ok: true,
            output: {
              rowCount: result.rowCount,
              truncated: result.rowCount > rows.length,
              rows,
            },
          };
        } finally {
          await client.end();
        }
      } catch (err) {
        throw new ToolError('db.query', 'EXECUTION_FAILED', `Query failed: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
