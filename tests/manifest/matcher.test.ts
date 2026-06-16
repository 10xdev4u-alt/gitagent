/**
 * Tests for the event matcher.
 */

import { describe, expect, it } from 'vitest';
import { matchManifests, normalizeEvent } from '../../src/manifest/matcher.js';
import type { GitHubEvent, Manifest } from '../../src/manifest/schema.js';

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

describe('matchManifests', () => {
  it('returns empty array when no manifests match', () => {
    const m = makeManifest('triage', ['issues.opened']);
    expect(matchManifests([m], 'pull_request.opened')).toEqual([]);
  });

  it('returns manifests subscribed to the event', () => {
    const m1 = makeManifest('triage', ['issues.opened']);
    const m2 = makeManifest('review', ['pull_request.opened']);
    const results = matchManifests([m1, m2], 'issues.opened');
    expect(results).toHaveLength(1);
    expect(results[0]?.manifest.frontmatter.name).toBe('triage');
  });

  it('prefers more specific manifests (more triggers)', () => {
    const specific = makeManifest('specific', ['issues.opened', 'issues.edited', 'issues.closed']);
    const generic = makeManifest('generic', ['issues.opened']);
    const results = matchManifests([generic, specific], 'issues.opened');
    expect(results[0]?.manifest.frontmatter.name).toBe('specific');
  });

  it('breaks ties alphabetically by name', () => {
    const a = makeManifest('a-triage', ['issues.opened']);
    const b = makeManifest('b-triage', ['issues.opened']);
    const results = matchManifests([b, a], 'issues.opened');
    expect(results.map((r) => r.manifest.frontmatter.name)).toEqual(['a-triage', 'b-triage']);
  });

  it('reason field explains the match', () => {
    const m = makeManifest('triage', ['issues.opened']);
    const r = matchManifests([m], 'issues.opened');
    expect(r[0]?.reason).toContain('issues.opened');
  });
});

describe('normalizeEvent', () => {
  it('combines event and action', () => {
    expect(normalizeEvent('issues', 'opened')).toBe('issues.opened');
    expect(normalizeEvent('pull_request', 'closed')).toBe('pull_request.closed');
  });

  it('returns the event alone when no action', () => {
    expect(normalizeEvent('webhook')).toBe('webhook');
    expect(normalizeEvent('manual')).toBe('manual');
  });
});
