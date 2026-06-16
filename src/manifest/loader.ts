/**
 * Load a single manifest file from disk.
 *
 * A manifest is a `.github/agents/<name>.md` file with YAML frontmatter
 * delimited by `---` and a markdown body.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ManifestError, ManifestValidationError } from './errors.js';
import { ManifestSchema, type Manifest } from './schema.js';

/** Options for {@link loadManifest}. */
export interface LoadManifestOptions {
  /** Required. Absolute path to the manifest file. */
  path: string;
}

/**
 * Load and validate a manifest from a file path.
 *
 * @throws {ManifestError} on any failure (file not found, parse error, validation error)
 */
export async function loadManifest(options: LoadManifestOptions): Promise<Manifest> {
  const { path: filePath } = options;
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ManifestError('FILE_NOT_FOUND', `No such file: ${filePath}`, {
        path: filePath,
        cause: err,
      });
    }
    throw new ManifestError('FILE_READ_ERROR', `Failed to read ${filePath}: ${(err as Error).message}`, {
      path: filePath,
      cause: err,
    });
  }

  return parseManifest(raw, filePath);
}

/**
 * Parse a manifest from its raw string content. Useful for tests and for
 * loading manifests from non-file sources (e.g. an in-memory registry).
 */
export function parseManifest(raw: string, filePath = '<string>'): Manifest {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    throw new ManifestError('INVALID_FRONTMATTER', `Failed to parse YAML frontmatter: ${(err as Error).message}`, {
      path: filePath,
      cause: err,
    });
  }

  if (typeof parsed.data !== 'object' || parsed.data === null) {
    throw new ManifestError('INVALID_FRONTMATTER', 'Frontmatter must be a YAML object', { path: filePath });
  }

  // Build the object the Zod schema expects: { frontmatter, body, path }
  const candidate = {
    frontmatter: parsed.data,
    body: parsed.content.trim(),
    path: filePath,
  };

  const result = ManifestSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ManifestValidationError(filePath, issues);
  }

  // Soft check: filename should usually match the agent name.
  const m = result.data;
  const expectedName = path.basename(filePath, path.extname(filePath)).toLowerCase();
  if (filePath !== '<string>' && m.frontmatter.name !== expectedName) {
    // eslint-disable-next-line no-console
    console.warn(
      `[gitagent] manifest name "${m.frontmatter.name}" does not match filename "${expectedName}"`,
    );
  }

  // If personality is not set explicitly, use the body
  if (!m.frontmatter.personality) {
    m.frontmatter.personality = m.body;
  }

  return m;
}
