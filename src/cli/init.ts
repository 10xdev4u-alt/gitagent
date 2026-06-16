/**
 * `gitagent init` — scaffold a new agent manifest.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface InitOptions {
  description?: string;
  trigger?: string[];
  force?: boolean;
}

const DEFAULT_TEMPLATE = (name: string, description: string, triggers: string[]) => `---
name: ${name}
description: ${description}
triggers:
${triggers.map((t) => `  - ${t}`).join('\n')}
model:
  provider: anthropic
  name: claude-sonnet-4-5
memory:
  type: git
  path: memory
tools: []
---

# ${name}

Describe what this agent does. Be specific about its goals, constraints, and
decision criteria. This is the agent's system prompt.

## When triggered

- For each trigger, explain when and how the agent should respond.
- What does it look at first?
- What does it do?
- What does it NOT do?

## Tone

Be concise. Be kind. Don't make promises on behalf of maintainers.
`;

export async function initCommand(name: string | undefined, options: InitOptions): Promise<void> {
  const agentName = name ?? 'triage';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(agentName)) {
    console.error(`Error: invalid agent name "${agentName}". Use lowercase alphanumeric + hyphens.`);
    process.exit(1);
  }
  const dir = path.join(process.cwd(), '.github', 'agents');
  const filePath = path.join(dir, `${agentName}.md`);

  // Check if it already exists
  try {
    await fs.access(filePath);
    if (!options.force) {
      console.error(`Error: ${filePath} already exists. Use --force to overwrite.`);
      process.exit(1);
    }
  } catch {
    // doesn't exist, ok
  }

  await fs.mkdir(dir, { recursive: true });
  const triggers = options.trigger ?? ['issues.opened'];
  const description = options.description ?? `${agentName} agent`;
  const content = DEFAULT_TEMPLATE(agentName, description, triggers);
  await fs.writeFile(filePath, content, 'utf8');
  console.log(`✓ Created ${filePath}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit ${filePath} to define the agent's behavior`);
  console.log(`  2. Run: gitagent validate`);
  console.log(`  3. Run: gitagent dev -e ${triggers[0]} -p ./fixture.json`);
}
