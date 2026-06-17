/**
 * Tests for the manifest loader.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { loadManifest, parseManifest } from '../../src/manifest/loader.js';
import { ManifestValidationError } from '../../src/manifest/errors.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseManifest', () => {
  it('parses a valid manifest', () => {
    const m = parseManifest(`---
name: triage
triggers:
  - issues.opened
---
# Body`);
    expect(m.frontmatter.name).toBe('triage');
    expect(m.frontmatter.triggers).toEqual(['issues.opened']);
  });

  it('throws ManifestValidationError for an invalid manifest', () => {
    expect(() =>
      parseManifest(`---
name: ""
triggers: []
---
# Body`),
    ).toThrow(ManifestValidationError);
  });

  it('uses body as personality when not set', () => {
    const m = parseManifest(`---
name: x
triggers:
  - issues.opened
---
# You are a helpful agent.`);
    expect(m.frontmatter.personality).toContain('helpful agent');
  });

  it('parses the body as Markdown', () => {
    const m = parseManifest(`---
name: x
triggers:
  - issues.opened
---
# Heading
**bold** text`);
    expect(m.body).toContain('Heading');
  });

  it('parses model config', () => {
    const m = parseManifest(`---
name: x
triggers:
  - issues.opened
model:
  provider: openai
  name: gpt-4o
  temperature: 0.5
---
# body`);
    expect(m.frontmatter.model.provider).toBe('openai');
    expect(m.frontmatter.model.name).toBe('gpt-4o');
    expect(m.frontmatter.model.temperature).toBe(0.5);
  });
});

describe('loadManifest', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gitagent-manifest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a manifest from a file', async () => {
    const filePath = join(dir, 'triage.md');
    writeFileSync(filePath, `---
name: triage
triggers:
  - issues.opened
---
# Body`);
    const m = await loadManifest({ path: filePath });
    expect(m.frontmatter.name).toBe('triage');
  });

  it('throws ManifestError for a non-existent file', async () => {
    await expect(loadManifest({ path: join(dir, 'missing.md') })).rejects.toThrow();
  });

  it('throws ManifestValidationError for an invalid manifest', async () => {
    const filePath = join(dir, 'bad.md');
    writeFileSync(filePath, `---
name: ""
triggers: []
---
`);
    await expect(loadManifest({ path: filePath })).rejects.toThrow(ManifestValidationError);
  });
});
