/**
 * Tests for the manifest registry.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestError } from '../../src/manifest/errors.js';
import { ManifestRegistry } from '../../src/manifest/registry.js';
import type { GitHubEvent, Manifest } from '../../src/manifest/schema.js';

describe('ManifestRegistry (in-memory)', () => {
  function makeManifest(name: string, triggers: GitHubEvent[]): Manifest {
    return {
      frontmatter: {
        name,
        triggers,
        memory: { type: 'git', path: 'memory', maxSizeBytes: 10485760, semantic: false },
        tools: [],
        approval: { read: 'never', write: 'required', planFirst: false, mention: [] },
        model: {
          provider: 'anthropic',
          name: 'claude-sonnet-4-5',
          temperature: 0.3,
          maxTokens: 4096,
        },
        limits: { maxSteps: 15, timeoutMs: 120000, maxTotalTokens: 200000, maxToolCalls: 30 },
        permissions: {
          repositories: [],
          protectedBranches: false,
          closeIssues: true,
          mergePRs: false,
          release: false,
          spend: false,
        },
        metadata: {},
      },
      body: 'body',
      path: `<memory>/${name}.md`,
    };
  }

  it('adds and retrieves manifests', () => {
    const r = new ManifestRegistry();
    const m = makeManifest('triage', ['issues.opened']);
    r.add(m);
    expect(r.size).toBe(1);
    expect(r.get('triage')).toBe(m);
  });

  it('rejects duplicate names', () => {
    const r = new ManifestRegistry();
    r.add(makeManifest('triage', ['issues.opened']));
    expect(() => r.add(makeManifest('triage', ['issues.closed']))).toThrow(ManifestError);
  });

  it('indexes manifests by event', () => {
    const r = new ManifestRegistry();
    r.add(makeManifest('triage', ['issues.opened', 'issues.edited']));
    r.add(makeManifest('closer', ['issues.closed']));
    expect(r.listForEvent('issues.opened').map((m) => m.frontmatter.name)).toEqual(['triage']);
    expect(r.listForEvent('issues.edited').map((m) => m.frontmatter.name)).toEqual(['triage']);
    expect(r.listForEvent('issues.closed').map((m) => m.frontmatter.name)).toEqual(['closer']);
    expect(r.listForEvent('pull_request.opened')).toEqual([]);
  });

  it('summary() returns a list of name/triggers/path', () => {
    const r = new ManifestRegistry();
    r.add(makeManifest('triage', ['issues.opened']));
    const s = r.summary();
    expect(s).toHaveLength(1);
    expect(s[0]?.name).toBe('triage');
    expect(s[0]?.triggers).toEqual(['issues.opened']);
  });

  it('fromMap builds from raw markdown strings', () => {
    const r = ManifestRegistry.fromMap({
      triage: `---
name: triage
triggers:
  - issues.opened
---

body
`,
      review: `---
name: review
triggers:
  - pull_request.opened
---

body
`,
    });
    expect(r.size).toBe(2);
    expect(r.get('triage')?.frontmatter.triggers).toEqual(['issues.opened']);
    expect(r.get('review')?.frontmatter.triggers).toEqual(['pull_request.opened']);
  });
});

describe('ManifestRegistry (disk)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-reg-'));
    await fs.mkdir(path.join(tmpDir, '.github/agents'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads manifests from a directory', async () => {
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
    await fs.writeFile(
      path.join(tmpDir, '.github/agents/release.md'),
      `---
name: release
triggers:
  - release.published
---

body
`,
    );

    const r = await ManifestRegistry.load({ repoRoot: tmpDir });
    expect(r.size).toBe(2);
    expect(r.listForEvent('issues.opened').map((m) => m.frontmatter.name)).toEqual(['triage']);
  });

  it('walks subdirectories', async () => {
    await fs.mkdir(path.join(tmpDir, '.github/agents/experimental'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.github/agents/experimental/nightly.md'),
      `---
name: nightly
triggers:
  - schedule.daily
---

body
`,
    );
    const r = await ManifestRegistry.load({ repoRoot: tmpDir });
    expect(r.size).toBe(1);
    expect(r.get('nightly')?.frontmatter.triggers).toEqual(['schedule.daily']);
  });

  it('returns empty registry when directory does not exist', async () => {
    const r = await ManifestRegistry.load({
      repoRoot: tmpDir,
      agentsPath: 'nonexistent',
    });
    expect(r.size).toBe(0);
  });

  it('throws on invalid manifest in the directory', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.github/agents/bad.md'),
      `---
name: "Bad"
triggers: []
---

`,
    );
    await expect(ManifestRegistry.load({ repoRoot: tmpDir })).rejects.toThrow();
  });
});
