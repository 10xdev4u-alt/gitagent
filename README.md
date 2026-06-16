# gitagent

> Persistent, versioned AI agents that live in your GitHub repository.

`gitagent` lets you declare AI agents in your repo as `.github/agents/*.md` files.
The agents react to GitHub events (issues, PRs, comments, releases), call LLMs,
and post back. Their memory lives in `.github/agents/<name>/memory/`, versioned
with your code. They learn from every interaction, and they commit their
improvements back.

## Why

Most AI agents are SaaS dashboards or local toys. They don't ship with your
code, they don't share your repo's audit trail, and they don't get better over
time without manual intervention.

`gitagent` flips that:

- **The agent is a file in your repo.** `cat .github/agents/triage.md` and you
  see exactly what it does.
- **The agent's memory is a directory in your repo.** Every decision is auditable.
- **The agent's tools are GitHub-native.** Label, comment, close, open a PR,
  request review — the same primitives a human maintainer uses.
- **The agent gets smarter over time.** Memory accumulates in git. The agent
  that triages your issues today is the same agent that triaged them 6 months
  ago, plus 200 resolved cases.
- **The agent is a peer, not a god.** Every write action is gated by an
  approval flow you configure.

## Quick start

```bash
# Install
npm install -g gitagent

# Scaffold an agent in your repo
cd your-repo
gitagent init triage

# Edit the manifest
$EDITOR .github/agents/triage.md

# Validate it
gitagent validate

# Run it locally against a synthetic event
gitagent dev --event issues.opened --payload ./fixtures/issue.json

# Deploy it as a GitHub App
gitagent serve
```

## Example manifest

```markdown
---
name: triage
description: Auto-triage new issues
triggers:
  - issues.opened
personality: |
  You are a careful, friendly issue triager. Be concise.
  Always check for duplicates before labeling.
memory:
  type: git
  path: .github/agents/triage/memory/
tools:
  - github.post_comment
  - github.add_labels
  - github.close_issue
  - github.search_issues
approval:
  write: required
model:
  provider: anthropic
  name: claude-sonnet-4-5
---

# Triage agent

When a new issue is opened:

1. Read the title and body carefully.
2. Search the issue tracker for similar past issues.
3. Apply a label: `bug`, `feature`, `question`, or `duplicate`.
4. If duplicate, post a comment linking to the original and close.
5. If bug, ask for a minimal reproduction.
6. If feature or question, leave open for human review.

Never assign labels without first reading the issue.
```

## Mental model

```
┌─────────────────┐
│  GitHub event   │  (issue, PR, comment, release, ...)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  gitagent serve │  (webhook receiver, signature verified)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Manifest load  │  (.github/agents/<name>.md matched to event)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Context build  │  (manifest + memory + event + tools)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  LLM call       │  (Anthropic, OpenAI, or compatible)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool execution │  (read tools auto-run, write tools gated)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post + commit  │  (comment posted, memory updated, push to repo)
└─────────────────┘
```

## Features

- **Declarative agents** in plain Markdown + YAML frontmatter
- **Persistent memory** in git, queryable across runs
- **GitHub-native tools**: comment, label, close, assign, open PR, request review
- **Approval flow** for any write action
- **Provider-agnostic**: Anthropic, OpenAI, or any OpenAI-compatible endpoint
- **Local dev mode** with synthetic events
- **GitHub App** for production deployment
- **Self-referential**: the agent that maintains gitagent IS gitagent

## Status

`gitagent` is in active development. See [ROADMAP.md](./ROADMAP.md) for the
current plan and [CHANGELOG.md](./CHANGELOG.md) for shipped features.

## License

MIT
