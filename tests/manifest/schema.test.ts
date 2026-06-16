/**
 * Tests for the manifest Zod schema.
 */

import { describe, expect, it } from 'vitest';
import {
  ApprovalPolicySchema,
  GitHubEventSchema,
  LimitsConfigSchema,
  ManifestFrontmatterSchema,
  ManifestSchema,
  MemoryConfigSchema,
  ModelConfigSchema,
  PermissionsConfigSchema,
  ScheduleConfigSchema,
  ToolRefSchema,
} from '../../src/manifest/schema.js';

describe('GitHubEventSchema', () => {
  it('accepts all known event names', () => {
    for (const event of [
      'issues.opened',
      'issues.closed',
      'issue_comment.created',
      'pull_request.opened',
      'pull_request_review.submitted',
      'release.published',
      'schedule.daily',
      'webhook',
      'manual',
    ]) {
      expect(GitHubEventSchema.parse(event)).toBe(event);
    }
  });

  it('rejects unknown event names', () => {
    expect(() => GitHubEventSchema.parse('foo.bar')).toThrow();
    expect(() => GitHubEventSchema.parse('issues.deleted')).toThrow(); // not a valid action
    expect(() => GitHubEventSchema.parse('')).toThrow();
  });
});

describe('MemoryConfigSchema', () => {
  it('applies defaults when empty', () => {
    const m = MemoryConfigSchema.parse({});
    expect(m.type).toBe('git');
    expect(m.path).toBe('memory');
    expect(m.maxSizeBytes).toBe(10 * 1024 * 1024);
    expect(m.semantic).toBe(false);
  });

  it('accepts custom configuration', () => {
    const m = MemoryConfigSchema.parse({
      type: 'sqlite',
      path: 'state',
      maxSizeBytes: 1024,
      semantic: true,
      embeddingModel: 'text-embedding-3-small',
    });
    expect(m.type).toBe('sqlite');
    expect(m.maxSizeBytes).toBe(1024);
    expect(m.semantic).toBe(true);
    expect(m.embeddingModel).toBe('text-embedding-3-small');
  });

  it('rejects negative maxSizeBytes', () => {
    expect(() => MemoryConfigSchema.parse({ maxSizeBytes: -1 })).toThrow();
  });

  it('rejects unknown memory type', () => {
    expect(() => MemoryConfigSchema.parse({ type: 'redis' })).toThrow();
  });
});

describe('ToolRefSchema', () => {
  it('accepts a bare string', () => {
    expect(ToolRefSchema.parse('github.post_comment')).toBe('github.post_comment');
  });

  it('accepts an object with overrides', () => {
    const t = ToolRefSchema.parse({
      name: 'github.merge_pr',
      approval: 'always',
      description: 'Merge with confirmation',
    });
    expect(t).toEqual({
      name: 'github.merge_pr',
      approval: 'always',
      description: 'Merge with confirmation',
    });
  });

  it('rejects empty string', () => {
    expect(() => ToolRefSchema.parse('')).toThrow();
  });
});

describe('ApprovalPolicySchema', () => {
  it('defaults are sensible (read: never, write: required)', () => {
    const a = ApprovalPolicySchema.parse({});
    expect(a.read).toBe('never');
    expect(a.write).toBe('required');
    expect(a.planFirst).toBe(false);
    expect(a.mention).toEqual([]);
  });

  it('accepts all valid approval values', () => {
    for (const v of ['never', 'always', 'required'] as const) {
      expect(ApprovalPolicySchema.parse({ read: v, write: v }).read).toBe(v);
      expect(ApprovalPolicySchema.parse({ read: v, write: v }).write).toBe(v);
    }
  });
});

describe('ModelConfigSchema', () => {
  it('defaults to Anthropic Claude Sonnet 4.5', () => {
    const m = ModelConfigSchema.parse({});
    expect(m.provider).toBe('anthropic');
    expect(m.name).toBe('claude-sonnet-4-5');
    expect(m.temperature).toBe(0.3);
    expect(m.maxTokens).toBe(4096);
  });

  it('accepts openai-compatible with baseURL', () => {
    const m = ModelConfigSchema.parse({
      provider: 'openai-compatible',
      name: 'llama-3-70b',
      baseURL: 'https://api.example.com/v1',
    });
    expect(m.provider).toBe('openai-compatible');
    expect(m.baseURL).toBe('https://api.example.com/v1');
  });

  it('rejects temperature out of range', () => {
    expect(() => ModelConfigSchema.parse({ temperature: 3 })).toThrow();
    expect(() => ModelConfigSchema.parse({ temperature: -0.1 })).toThrow();
  });
});

describe('LimitsConfigSchema', () => {
  it('defaults are reasonable', () => {
    const l = LimitsConfigSchema.parse({});
    expect(l.maxSteps).toBe(15);
    expect(l.timeoutMs).toBe(120_000);
    expect(l.maxTotalTokens).toBe(200_000);
    expect(l.maxToolCalls).toBe(30);
  });

  it('rejects non-positive values', () => {
    expect(() => LimitsConfigSchema.parse({ maxSteps: 0 })).toThrow();
    expect(() => LimitsConfigSchema.parse({ timeoutMs: -1 })).toThrow();
  });
});

describe('ScheduleConfigSchema', () => {
  it('accepts a valid cron', () => {
    const s = ScheduleConfigSchema.parse({ cron: '0 9 * * 1' });
    expect(s.cron).toBe('0 9 * * 1');
    expect(s.timezone).toBe('UTC');
  });

  it('requires cron field', () => {
    expect(() => ScheduleConfigSchema.parse({})).toThrow();
  });
});

describe('PermissionsConfigSchema', () => {
  it('defaults are conservative', () => {
    const p = PermissionsConfigSchema.parse({});
    expect(p.protectedBranches).toBe(false);
    expect(p.closeIssues).toBe(true);
    expect(p.mergePRs).toBe(false);
    expect(p.release).toBe(false);
    expect(p.spend).toBe(false);
  });
});

describe('ManifestFrontmatterSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const m = ManifestFrontmatterSchema.parse({
      name: 'triage',
      triggers: ['issues.opened'],
    });
    expect(m.name).toBe('triage');
    expect(m.triggers).toEqual(['issues.opened']);
    expect(m.memory.type).toBe('git'); // default
    expect(m.model.provider).toBe('anthropic'); // default
  });

  it('rejects invalid name (uppercase)', () => {
    expect(() =>
      ManifestFrontmatterSchema.parse({
        name: 'Triage',
        triggers: ['issues.opened'],
      }),
    ).toThrow();
  });

  it('rejects invalid name (special chars)', () => {
    expect(() =>
      ManifestFrontmatterSchema.parse({
        name: 'triage-bot!',
        triggers: ['issues.opened'],
      }),
    ).toThrow();
  });

  it('rejects empty triggers', () => {
    expect(() =>
      ManifestFrontmatterSchema.parse({
        name: 'triage',
        triggers: [],
      }),
    ).toThrow();
  });

  it('accepts a fully-specified manifest', () => {
    const m = ManifestFrontmatterSchema.parse({
      name: 'release-prep',
      description: 'Auto-prepare releases',
      triggers: ['release.published', 'schedule.weekly'],
      personality: 'You are a release engineer.',
      memory: { type: 'git', path: 'state', semantic: true },
      tools: ['github.post_comment', 'github.create_pr', { name: 'github.merge_pr', approval: 'always' }],
      approval: { read: 'never', write: 'always' },
      model: { provider: 'openai', name: 'gpt-4o' },
      limits: { maxSteps: 5, timeoutMs: 60_000 },
      permissions: { mergePRs: true, release: true },
      metadata: { owner: 'platform-team' },
    });
    expect(m.tools).toHaveLength(3);
    expect(m.tools[0]).toBe('github.post_comment');
    if (typeof m.tools[1] !== 'string') {
      expect(m.tools[1].approval).toBe('always');
    }
    expect(m.metadata.owner).toBe('platform-team');
  });
});

describe('ManifestSchema (full)', () => {
  it('accepts a complete manifest with body', () => {
    const m = ManifestSchema.parse({
      frontmatter: { name: 'triage', triggers: ['issues.opened'] },
      body: 'You are a triage agent.',
      path: '/repo/.github/agents/triage.md',
    });
    expect(m.frontmatter.name).toBe('triage');
    expect(m.body).toBe('You are a triage agent.');
    expect(m.path).toBe('/repo/.github/agents/triage.md');
  });

  it('rejects when frontmatter fails validation', () => {
    expect(() =>
      ManifestSchema.parse({
        frontmatter: { name: 'BadName', triggers: [] },
        body: '',
        path: '/x.md',
      }),
    ).toThrow();
  });
});
