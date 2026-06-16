/**
 * Tests for the CLI commands.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCommand } from '../../src/cli/init.js';
import { validateCommand } from '../../src/cli/validate.js';
import { listCommand } from '../../src/cli/list.js';
import { configCommand } from '../../src/cli/config.js';

describe('initCommand', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-cli-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds a manifest with the given name', async () => {
    await initCommand('triage', { trigger: ['issues.opened'] });
    const filePath = path.join(tmpDir, '.github/agents/triage.md');
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('name: triage');
    expect(content).toContain('triggers:');
    expect(content).toContain('issues.opened');
  });

  it('refuses to overwrite without --force', async () => {
    await initCommand('triage', {});
    const orig = process.exit;
    const exits: number[] = [];
    process.exit = ((n?: number) => {
      exits.push(n ?? 0);
      throw new Error('exit');
    }) as never;
    try {
      try {
        await initCommand('triage', {});
      } catch {
        // expected
      }
      expect(exits[0]).toBe(1);
    } finally {
      process.exit = orig;
    }
  });

  it('overwrites with --force', async () => {
    await initCommand('triage', { description: 'first' });
    await initCommand('triage', { force: true, description: 'second' });
    const content = await fs.readFile(path.join(tmpDir, '.github/agents/triage.md'), 'utf8');
    expect(content).toContain('second');
  });

  it('rejects invalid names', async () => {
    const orig = process.exit;
    const exits: number[] = [];
    process.exit = ((n?: number) => {
      exits.push(n ?? 0);
      throw new Error('exit');
    }) as never;
    try {
      try {
        await initCommand('Bad-Name', {});
      } catch {
        // expected
      }
      expect(exits[0]).toBe(1);
    } finally {
      process.exit = orig;
    }
  });
});

describe('validateCommand', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-cli-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reports when no manifests exist', async () => {
    // Capture console.log
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      await validateCommand();
      expect(logs.some((l) => l.includes('No agent manifests'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });

  it('lists valid manifests', async () => {
    await fs.mkdir(path.join(tmpDir, '.github/agents'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.github/agents/triage.md'),
      `---
name: triage
triggers:
  - issues.opened
---

body
`,
    );
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      await validateCommand();
      expect(logs.some((l) => l.includes('triage'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});

describe('listCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-cli-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists agents from the given repo root', async () => {
    await fs.mkdir(path.join(tmpDir, '.github/agents'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.github/agents/triage.md'),
      `---
name: triage
triggers:
  - issues.opened
---

body
`,
    );
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      await listCommand({ repoRoot: tmpDir });
      expect(logs.some((l) => l.includes('triage'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});

describe('configCommand', () => {
  it('prints resolved config as JSON', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      await configCommand();
      const out = logs.join('\n');
      const parsed = JSON.parse(out);
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.env).toBeDefined();
      expect(parsed.paths.cwd).toBeDefined();
    } finally {
      console.log = origLog;
    }
  });
});
