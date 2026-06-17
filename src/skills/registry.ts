/**
 * Skill registry.
 *
 * A "skill" is a named collection of tools, memory, and personality that
 * an agent can include. For example, a `gh-pr-review` skill might
 * bundle `github.get_file`, `github.list_pull_requests`, and
 * `github.post_comment` with a personality tuned for code review.
 *
 * Skills are declared in `.github/agents/skills/<name>.json` and are
 * resolved at agent-load time.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ToolRegistry, type ToolDefinition } from '../tools/registry.js';
import { ToolError } from '../tools/errors.js';

export const SkillConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Tools this skill provides. Can reference standard tools by name. */
  tools: z.array(z.string()).default([]),
  /** Optional personality override. */
  personality: z.string().optional(),
  /** Optional model config override. */
  model: z
    .object({
      provider: z.string().optional(),
      name: z.string().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    })
    .optional(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

export class SkillRegistry {
  private readonly skills: Map<string, SkillConfig> = new Map();

  /** Register a skill. */
  register(skill: SkillConfig): void {
    this.skills.set(skill.name, skill);
  }

  /** Get a skill by name. */
  get(name: string): SkillConfig | undefined {
    return this.skills.get(name);
  }

  /** List all skills. */
  list(): SkillConfig[] {
    return Array.from(this.skills.values());
  }

  /** Number of registered skills. */
  get size(): number {
    return this.skills.size;
  }

  /** Apply a skill to a tool registry — adds all the skill's tools. */
  apply(name: string, registry: ToolRegistry): ToolDefinition[] {
    const skill = this.skills.get(name);
    if (!skill) throw new ToolError('skill', 'EXECUTION_FAILED', `Unknown skill: ${name}`);
    const added: ToolDefinition[] = [];
    for (const toolName of skill.tools) {
      const tool = registry.get(toolName);
      if (tool) added.push(tool);
    }
    return added;
  }

  /** Load skills from a directory of JSON files. */
  static async load(options: { path: string }): Promise<SkillRegistry> {
    const registry = new SkillRegistry();
    const entries = await walk(options.path);
    for (const file of entries) {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      const parsed = SkillConfigSchema.parse(data);
      registry.register(parsed);
    }
    return registry;
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(full)));
      else if (e.isFile() && full.endsWith('.json')) out.push(full);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return out;
}
