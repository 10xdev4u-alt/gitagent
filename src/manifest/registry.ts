/**
 * The manifest registry.
 *
 * Discovers all `.github/agents/**/*.md` files in a repo, loads and
 * validates them, and indexes them by event trigger for fast lookup.
 */

import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { ManifestError } from './errors.js';
import { loadManifest, parseManifest } from './loader.js';
import type { GitHubEvent, Manifest, ManifestFrontmatter } from './schema.js';

/** Options for {@link ManifestRegistry.load}. */
export interface RegistryLoadOptions {
  /** Path to the repo root (defaults to cwd). */
  repoRoot?: string;
  /** Path under the repo where manifests live. Defaults to `.github/agents`. */
  agentsPath?: string;
  /** Optional regex to filter files (default: `/\.md$/`). */
  pattern?: RegExp;
}

/**
 * In-memory registry of all loaded manifests. Built by {@link ManifestRegistry.load}.
 */
export class ManifestRegistry {
  private readonly manifests: Map<string, Manifest> = new Map();
  private readonly byEvent: Map<GitHubEvent, Manifest[]> = new Map();

  /** Add a manifest to the registry. */
  add(manifest: Manifest): void {
    const name = manifest.frontmatter.name;
    if (this.manifests.has(name)) {
      throw new ManifestError(
        'VALIDATION_FAILED',
        `Duplicate manifest name "${name}" — each agent must have a unique name`,
        { path: manifest.path },
      );
    }
    this.manifests.set(name, manifest);
    for (const trigger of manifest.frontmatter.triggers) {
      const list = this.byEvent.get(trigger) ?? [];
      list.push(manifest);
      this.byEvent.set(trigger, list);
    }
  }

  /** Get a manifest by name. */
  get(name: string): Manifest | undefined {
    return this.manifests.get(name);
  }

  /** List all manifests. */
  list(): Manifest[] {
    return Array.from(this.manifests.values());
  }

  /** List manifests that subscribe to a given event. */
  listForEvent(event: GitHubEvent): Manifest[] {
    return this.byEvent.get(event) ?? [];
  }

  /** Number of registered manifests. */
  get size(): number {
    return this.manifests.size;
  }

  /** All event triggers registered. */
  events(): GitHubEvent[] {
    return Array.from(this.byEvent.keys());
  }

  /** Build a summary suitable for logging. */
  summary(): Array<{ name: string; triggers: string[]; path: string }> {
    return this.list().map((m) => ({
      name: m.frontmatter.name,
      triggers: m.frontmatter.triggers,
      path: m.path,
    }));
  }

  /**
   * Load all manifests from a directory. Walks the directory recursively,
   * reads every `*.md` file, parses + validates it, and adds it to the registry.
   *
   * @throws {ManifestError} on the first invalid manifest
   */
  static async load(options: RegistryLoadOptions = {}): Promise<ManifestRegistry> {
    const repoRoot = options.repoRoot ?? process.cwd();
    const agentsPath = path.join(repoRoot, options.agentsPath ?? '.github/agents');
    const pattern = options.pattern ?? /\.md$/;
    const registry = new ManifestRegistry();

    const files = await walk(agentsPath, pattern);
    for (const file of files) {
      const manifest = await loadManifest({ path: file });
      registry.add(manifest);
    }

    return registry;
  }

  /**
   * Build a registry from an in-memory map of name -> raw content. Useful
   * for tests and for embedding manifests in code.
   */
  static fromMap(
    entries: Record<string, string>,
    options: { virtualPath?: string } = {},
  ): ManifestRegistry {
    const registry = new ManifestRegistry();
    for (const [name, raw] of Object.entries(entries)) {
      const filePath = options.virtualPath ? `${options.virtualPath}/${name}.md` : `<memory>/${name}.md`;
      const manifest = parseManifest(raw, filePath);
      registry.add(manifest);
    }
    return registry;
  }
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

async function walk(dir: string, pattern: RegExp): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return out;
    }
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, pattern)));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Type guard for the frontmatter only (no body). */
export function isManifestFrontmatter(value: unknown): value is ManifestFrontmatter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'triggers' in value &&
    Array.isArray((value as { triggers: unknown }).triggers)
  );
}
