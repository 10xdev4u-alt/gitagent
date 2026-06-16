/**
 * Tests for the manifest loader and parser.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestError, ManifestValidationError } from '../../src/manifest/errors.js';
import { loadManifest, parseManifest } from '../../src/manifest/loader.js';

describe('parseManifest', () => {
  it('parses a valid manifest with frontmatter + body', () => {
    const raw = `---
name: triage
description: Auto-triage new issues
triggers:
  - issues.opened
tools:
  - github.post_comment
---

You are a triage agent. Be concise.
`;
    const m = parseManifest(raw, '/repo/.github/agents/triage.md');
    expect(m.frontmatter.name).toBe('triage');
    expect(m.frontmatter.description).toBe('Auto-triage new issues');
    expect(m.frontmatter.triggers).toEqual(['issues.opened']);
    expect(m.frontmatter.tools).toEqual(['github.post_comment']);
    expect(m.body).toBe('You are a triage agent. Be concise.');
    expect(m.frontmatter.personality).toBe('You are a triage agent. Be concise.');
  });

  it('keeps explicit personality over body', () => {
    const raw = `---
name: x
triggers: [issues.opened]
personality: |
  I am the system prompt.
---

This is the body, but personality is set.
`;
    const m = parseManifest(raw, '/x.md');
    expect(m.frontmatter.personality).toBe('I am the system prompt.\n');
  });

  it('rejects invalid frontmatter (missing triggers)', () => {
    const raw = `---
name: triage
---

body
`;
    expect(() => parseManifest(raw, '/x.md')).toThrow(ManifestValidationError);
  });

  it('rejects invalid frontmatter (bad name)', () => {
    const raw = `---
name: "Triage"
triggers: [issues.opened]
---

body
`;
    expect(() => parseManifest(raw, '/x.md')).toThrow(ManifestValidationError);
  });

  it('rejects non-YAML frontmatter', () => {
    const raw = `not actually yaml frontmatter`;
    expect(() => parseManifest(raw, '/x.md')).toThrow();
  });

  it('rejects when frontmatter is not a YAML object', () => {
    const raw = `---
- just
- a
- list
---

body
`;
    expect(() => parseManifest(raw, '/x.md')).toThrow();
  });
});

describe('loadManifest (file system)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid manifest from disk', async () => {
    const filePath = path.join(tmpDir, 'triage.md');
    await fs.writeFile(
      filePath,
      `---
name: triage
triggers:
  - issues.opened
---

body
`,
      'utf8',
    );
    const m = await loadManifest({ path: filePath });
    expect(m.frontmatter.name).toBe('triage');
    expect(m.path).toBe(filePath);
  });

  it('throws ManifestError with FILE_NOT_FOUND code', async () => {
    const filePath = path.join(tmpDir, 'nope.md');
    try {
      await loadManifest({ path: filePath });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestError);
      expect((err as ManifestError).code).toBe('FILE_NOT_FOUND');
    }
  });

  it('throws ManifestValidationError for invalid manifest', async () => {
    const filePath = path.join(tmpDir, 'bad.md');
    await fs.writeFile(filePath, `name: bad\ntriggers: []\n`, 'utf8');
    try {
      await loadManifest({ path: filePath });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError);
      const ve = err as ManifestValidationError;
      expect(ve.issues.length).toBeGreaterThan(0);
    }
  });
});
