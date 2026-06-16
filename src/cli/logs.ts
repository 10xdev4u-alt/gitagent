/**
 * `gitagent logs` — show recent agent run logs.
 *
 * v0.1 stub: real implementation will read from `.github/agents/<name>/runs/*.jsonl`
 * once the server starts persisting runs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface LogsOptions {
  agent: string;
  repoRoot: string;
  limit: number;
}

export async function logsCommand(options: LogsOptions): Promise<void> {
  const logDir = path.join(options.repoRoot, '.github', 'agents', options.agent, 'runs');
  try {
    await fs.access(logDir);
  } catch {
    console.log('No runs recorded yet.');
    console.log(`  Expected: ${logDir}`);
    return;
  }
  const files = (await fs.readdir(logDir))
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse()
    .slice(0, options.limit);
  if (files.length === 0) {
    console.log('No runs recorded yet.');
    return;
  }
  for (const file of files) {
    const lines = (await fs.readFile(path.join(logDir, file), 'utf8')).trim().split('\n');
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { ts: string; event: string; level?: string; msg?: string; meta?: unknown };
        const level = (entry.level ?? 'info').toUpperCase().padEnd(5);
        console.log(`${entry.ts}  ${level}  ${entry.msg ?? entry.event}`);
      } catch {
        console.log(line);
      }
    }
  }
}
