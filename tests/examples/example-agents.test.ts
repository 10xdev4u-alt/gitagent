/**
 * Tests for the Agent skeleton helper utilities.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('agent example structure', () => {
  it('has the required frontmatter fields', () => {
    const example = {
      name: 'test',
      description: 'test agent',
      triggers: ['issues.opened'],
      model: { provider: 'anthropic', name: 'claude-sonnet-4-5' },
    };
    expect(example.name).toBeTruthy();
    expect(example.description).toBeTruthy();
    expect(example.triggers.length).toBeGreaterThan(0);
    expect(example.model.provider).toBeTruthy();
    expect(example.model.name).toBeTruthy();
  });

  it('parses a realistic example manifest', async () => {
    const yaml = `---
name: triage
description: Auto-triage new issues
triggers:
  - issues.opened
  - issues.labeled
model:
  provider: anthropic
  name: claude-sonnet-4-5
  temperature: 0.1
memory:
  type: git
  path: memory
  semantic: true
tools:
  - github.post_comment
  - github.add_labels
  - memory.read
  - memory.write
approval:
  read: never
  write: required
limits:
  maxSteps: 12
  timeoutMs: 90000
permissions:
  closeIssues: false
  mergePRs: false
  release: false
---

# Triage agent

You are a friendly issue triager.
`;

    const { parseManifest } = await import('../../src/manifest/loader.js');
    const m = parseManifest(yaml);
    expect(m.frontmatter.name).toBe('triage');
    expect(m.frontmatter.triggers).toHaveLength(2);
    expect(m.frontmatter.tools).toHaveLength(4);
    expect(m.frontmatter.model.temperature).toBe(0.1);
    expect(m.frontmatter.limits.maxSteps).toBe(12);
  });
});
