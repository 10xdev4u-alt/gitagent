/**
 * Tests for the event matcher.
 */

import { describe, expect, it } from 'vitest';
import { matchManifests, normalizeEvent } from '../../src/manifest/matcher.js';
import type { Manifest } from '../../src/manifest/schema.js';

function makeManifest(name: string, triggers: string[]): Manifest {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      triggers: triggers as Manifest['frontmatter']['triggers'],
      model: { provider: 'anthropic', name: 'claude-sonnet-4-5', temperature: 0, maxTokens: 4096 },
      memory: { type: 'git', path: 'memory', maxSizeBytes: 0, semantic: false },
      tools: [],
      approval: { read: 'never', write: 'required', planFirst: false, mention: [] },
      limits: { maxSteps: 10, timeoutMs: 60000, maxTotalTokens: 0, maxToolCalls: 0 },
      permissions: { repositories: [], protectedBranches: false, closeIssues: false, mergePRs: false, release: false, spend: false },
      metadata: { author: 'test' },
    },
    body: '',
    path: `${name}.md`,
  };
}

describe('matchManifests', () => {
  it('returns matching manifests', () => {
    const m = makeManifest('triage', ['issues.opened']);
    const result = matchManifests([m], 'issues.opened');
    expect(result).toHaveLength(1);
    expect(result[0]?.manifest.frontmatter.name).toBe('triage');
  });

  it('returns empty for no match', () => {
    const m = makeManifest('triage', ['issues.opened']);
    const result = matchManifests([m], 'pull_request.opened');
    expect(result).toHaveLength(0);
  });

  it('sorts by specificity (more triggers first)', () => {
    const a = makeManifest('generic', ['issues.opened']);
    const b = makeManifest('specific', ['issues.opened', 'issues.closed', 'issues.labeled']);
    const result = matchManifests([a, b], 'issues.opened');
    expect(result[0]?.manifest.frontmatter.name).toBe('specific');
  });

  it('breaks ties by name', () => {
    const a = makeManifest('alpha', ['issues.opened']);
    const b = makeManifest('beta', ['issues.opened']);
    const result = matchManifests([a, b], 'issues.opened');
    expect(result[0]?.manifest.frontmatter.name).toBe('alpha');
  });

  it('includes a reason for the match', () => {
    const m = makeManifest('triage', ['issues.opened']);
    const result = matchManifests([m], 'issues.opened');
    expect(result[0]?.reason).toContain('issues.opened');
  });
});

describe('normalizeEvent', () => {
  it('combines event and action', () => {
    expect(normalizeEvent('issues', 'opened')).toBe('issues.opened');
  });

  it('returns event alone when no action', () => {
    expect(normalizeEvent('push')).toBe('push');
  });
});
