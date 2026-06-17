# Manifest spec

Every agent in `gitagent` is a single `.github/agents/<name>.md` file with
two parts:

1. **YAML frontmatter** — agent configuration (triggers, tools, model, etc.)
2. **Markdown body** — the agent's system prompt / personality

The frontmatter is validated against a Zod schema. The body is passed
to the LLM as the system prompt.

## File location

```
.github/agents/<name>.md
```

The filename should match the `name` field in the frontmatter. The
registry will warn if they don't match.

## Frontmatter fields

### Required

| Field | Type | Description |
|---|---|---|
| `name` | string | Lowercase alphanumeric + hyphens. Must match filename. |
| `triggers` | string[] | One or more GitHub events the agent subscribes to. |

### Recommended

| Field | Type | Default | Description |
|---|---|---|---|
| `description` | string | — | Short human-readable description. |
| `personality` | string | body | Override the system prompt (instead of using the body). |
| `memory` | object | `{ type: 'git' }` | Memory backend config. |
| `tools` | string[] | `[]` | Tools the agent can use. |
| `model` | object | Anthropic Sonnet 4.5 | LLM model config. |
| `limits` | object | see below | Execution limits. |
| `approval` | object | see below | Approval policy. |
| `permissions` | object | see below | What the agent is allowed to do. |

### Optional

| Field | Type | Description |
|---|---|---|
| `schedule` | object | Cron schedule for periodic runs. |
| `metadata` | object | Free-form metadata for tooling. |

## Event triggers

The `triggers` field is an array of event names. Supported values:

- **Issues:** `issues.opened`, `issues.edited`, `issues.closed`, `issues.reopened`, `issues.labeled`, `issues.unlabeled`, `issues.assigned`, `issues.unassigned`
- **Comments:** `issue_comment.created`, `issue_comment.edited`, `issue_comment.deleted`
- **Pull requests:** `pull_request.opened`, `pull_request.edited`, `pull_request.closed`, `pull_request.reopened`, `pull_request.synchronize`, `pull_request.ready_for_review`, `pull_request.labeled`, `pull_request.assigned`, `pull_request.review_requested`, `pull_request.review_request_removed`
- **PR reviews:** `pull_request_review.submitted`, `pull_request_review.edited`, `pull_request_review.dismissed`
- **PR review comments:** `pull_request_review_comment.created`, `pull_request_review_comment.edited`, `pull_request_review_comment.deleted`
- **PR commits:** `pull_request_commit.created`, `pull_request_comment.created`
- **Releases:** `release.published`, `release.unpublished`, `release.created`, `release.edited`, `release.deleted`
- **Discussions:** `discussion.created`, `discussion.edited`, `discussion.deleted`, `discussion_comment.created`, `discussion_comment.edited`, `discussion_comment.deleted`
- **Workflows:** `workflow_run.completed`, `workflow_run.requested`, `workflow_job.completed`
- **Schedule:** `schedule.daily`, `schedule.weekly`, `schedule.monthly`
- **Generic:** `webhook`, `manual`

## Memory

```yaml
memory:
  type: git          # 'git' | 'sqlite' | 'in-memory'
  path: memory       # path under .github/agents/<name>/
  maxSizeBytes: 10485760   # 10 MB default
  semantic: false    # enable vector search
  embeddingModel: text-embedding-3-small   # for semantic
```

The `git` backend stores memory as files in the repo, so it's versioned
and auditable. The `sqlite` backend uses `better-sqlite3` for indexed
lookups. The `in-memory` backend is for tests and ephemeral runs.

When `semantic: true`, the agent gets a `memory.search` tool that uses
cosine similarity over the entries.

## Tools

```yaml
tools:
  - github.post_comment
  - github.add_labels
  - { name: github.merge_pr, approval: always }
```

Each tool is either a string (just the name) or an object with
overrides. Supported overrides:

- `approval: 'always' | 'never' | 'required'` — override the manifest's
  default approval for this tool.

Available standard tools: see [tools.md](./tools.md).

## Model

```yaml
model:
  provider: anthropic      # anthropic | openai | openai-compatible | google | mistral | cohere | custom
  name: claude-sonnet-4-5
  temperature: 0.3
  maxTokens: 4096
  topP: 0.95               # optional
  stopSequences: ["\n\n"]  # optional
  baseURL: https://api.example.com/v1   # for openai-compatible
```

The `baseURL` is honored only by `openai-compatible` providers.

## Limits

```yaml
limits:
  maxSteps: 15
  timeoutMs: 120000
  maxTotalTokens: 200000
  maxToolCalls: 30
```

The runtime enforces these. Hitting any of them ends the run with
`stopReason: max_steps` / `max_tokens` / `timeout`.

## Approval

```yaml
approval:
  read: never      # never | always | required
  write: required  # never | always | required
  planFirst: false # post a plan before executing write tools
  mention: ["@maintainers"]  # mentions to ping on approval
```

- `read: never` (default) — read tools run without prompting.
- `read: always` — every read tool requires approval.
- `read: required` — approval is required per-tool (default: never).
- `write: required` (default) — write tools require approval.
- `write: never` — write tools run without prompting. **Dangerous.**
- `write: always` — every write tool requires approval.

## Permissions

```yaml
permissions:
  repositories: []     # regex of repos the agent may operate on (default: only the host repo)
  protectedBranches: false  # may push to main / master
  closeIssues: true    # may close issues
  mergePRs: false      # may merge PRs
  release: false       # may create releases
  spend: false         # may call paid APIs
```

Even if a tool is in the `tools:` list, the agent can't use it unless
the corresponding permission is enabled. **Defense in depth.**

## Schedule

```yaml
schedule:
  cron: "0 9 * * 1"   # every Monday at 9 AM
  timezone: UTC
  description: Weekly report
```

When set, the agent runs on the cron schedule in addition to its
event triggers.

## Example

```markdown
---
name: triage
description: Auto-triage new issues
triggers:
  - issues.opened
model:
  provider: anthropic
  name: claude-sonnet-4-5
  temperature: 0.2
memory:
  type: git
  path: memory
  semantic: true
tools:
  - github.post_comment
  - github.add_labels
  - github.search_issues
  - github.close_issue
approval:
  read: never
  write: required
limits:
  maxSteps: 8
  timeoutMs: 90000
permissions:
  closeIssues: true
---

# Triage agent

You are a careful, friendly issue triager. Be concise. One short
comment per issue, max.

When a new issue is opened:

1. Read the title and body.
2. Search for similar past issues.
3. Apply one label: `bug`, `feature`, `question`, `docs`, or `duplicate`.
4. If duplicate, post a comment linking to the original and close.
5. If bug and no repro, ask for one.
6. Otherwise, leave open.
```

## Validation

Run `gitagent validate` to check all manifests in the repo:

```bash
$ gitagent validate
✓ Found 1 manifest:

  triage
    path: .github/agents/triage.md
    triggers: issues.opened
```

Validation errors include the file path, the field, and a hint:
```
✗ ManifestError[INVALID_NAME] (in .github/agents/Bad.md): name must be lowercase alphanumeric + hyphens
```

## See also

- [tools.md](./tools.md) — list of standard tools and how to add custom ones
- [README.md](../README.md) — quick start
- [SECURITY.md](../SECURITY.md) — threat model and mitigations
