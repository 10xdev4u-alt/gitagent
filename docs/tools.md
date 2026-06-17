# Tools

A tool is a function the agent can call during a run. Tools have:

- A `name` — used to invoke it
- A `description` — shown to the LLM so it knows when to use it
- A `inputSchema` (Zod) — describes the input shape
- An `execute` function — does the work

## Standard tools

### Comments

- **`github.post_comment`** — post a comment on an issue or PR
  - `issueNumber: number`, `body: string`

### Labels

- **`github.add_labels`** — add labels
  - `issueNumber: number`, `labels: string[]`
- **`github.remove_label`** — remove a label
  - `issueNumber: number`, `label: string`

### Issues

- **`github.close_issue`** — close an issue or PR
  - `issueNumber: number`, `comment?: string`, `reason?: 'completed' | 'not_planned'`
- **`github.reopen_issue`** — reopen
  - `issueNumber: number`
- **`github.assign`** — assign users
  - `issueNumber: number`, `assignees: string[]`
- **`github.list_issues`** — list issues
  - `state: 'open' | 'closed' | 'all'`, `labels?: string[]`, `assignee?: string`, `perPage?: number`
- **`github.search_issues`** — search issues
  - `query: string`, `perPage?: number`

### Pull requests

- **`github.create_pr`** — open a PR
  - `title: string`, `body: string`, `head: string`, `base: string`, `draft?: boolean`
- **`github.request_review`** — request a review
  - `pullNumber: number`, `reviewers?: string[]`, `teamReviewers?: string[]`
- **`github.merge_pr`** — merge a PR
  - `pullNumber: number`, `mergeMethod?: 'merge' | 'squash' | 'rebase'`, `commitMessage?: string`
- **`github.list_pull_requests`** — list PRs
  - `state: 'open' | 'closed' | 'all'`, `base?: string`, `head?: string`, `author?: string`, `perPage?: number`

### Reactions

- **`github.add_reaction`** — add a reaction
  - `target: 'issue' | 'comment'`, `id: number`, `reaction: string`

### Reads

- **`github.get_file`** — read a file's content
  - `path: string`, `ref?: string`
- **`github.list_workflow_runs`** — list CI runs
  - `workflowId?: string`, `branch?: string`, `status?: string`, `conclusion?: string`, `perPage?: number`

### Memory

- **`memory.read`** — read a memory entry by key
  - `key: string`
- **`memory.write`** — write a memory entry
  - `key: string`, `content: string`, `metadata?: object`
- **`memory.list`** — list memory entries
  - `prefix?: string`, `limit?: number`
- **`memory.search`** — semantic search memory (requires `semantic: true`)
  - `query: string`, `limit?: number`, `minScore?: number`

## Custom tools

Define your own tools by importing `defineTool` (or just creating a
`ToolDefinition`):

```ts
import { defineTool, ToolRegistry } from 'gitagent/tools';
import { z } from 'zod';

const tool = defineTool({
  name: 'my_org.send_slack',
  description: 'Send a message to a Slack channel',
  inputSchema: z.object({
    channel: z.string(),
    text: z.string().max(4000),
  }),
  execute: async (input, ctx) => {
    const { channel, text } = input as { channel: string; text: string };
    // ... call Slack API ...
    return { ok: true, output: { ts: '1234.5678' } };
  },
});

const registry = new ToolRegistry();
registry.register(tool);
```

Then pass the registry to the runtime.

## Approval

By default, every write tool requires approval. You can override per
tool in the manifest:

```yaml
tools:
  - github.post_comment           # default: approval: required (write)
  - { name: github.merge_pr, approval: always }  # always require
  - { name: github.post_comment, approval: never }  # never require (dangerous)
```

The approval flow runs in the agent loop after schema validation and
before `execute()`. The caller decides how to surface approval (CLI
prompt, server response, etc.).

## ToolContext

Every `execute` call gets a `ToolContext`:

```ts
interface ToolContext {
  agentName: string;
  runId: string;
  repo: { owner: string; name: string };
  event: { name: string; action?: string; payload: unknown };
  dryRun: boolean;
  logger: { debug, info, warn, error };
}
```

`dryRun: true` means the tool should NOT make side effects. Standard
tools honor this by short-circuiting and returning `{ ok: true, output: { dryRun: true } }`.

## See also

- [manifest-spec.md](./manifest-spec.md) — how tools are declared in a manifest
- [README.md](../README.md) — quick start
