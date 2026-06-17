# Migrating to gitagent

This guide helps you migrate an existing AI agent (or build a
new one) to use gitagent. The migration is incremental — you
can adopt one piece at a time.

## Why migrate

The benefits of gitagent over a custom agent framework:

- **Versioned:** the agent is in your repo. The agent is
  reviewed like code. The agent is deployed like code.
- **Auditable:** every action is logged. Every decision is
  traced. Every tool call is recorded.
- **Reproducible:** the same input produces the same output
  (within LLM limits). The agent is deterministic.
- **Recoverable:** every action can be undone. The agent is
  safe to deploy.

## The 4-step migration

### Step 1: Adopt the manifest

The manifest is the configuration. The manifest is the
contract. The manifest is the agent.

Move your agent's config from wherever it is (YAML in
another folder, env vars, code) to a `.github/agents/<name>.md`
file. The manifest is the new home.

```yaml
# .github/agents/triage.md
---
name: triage
description: Auto-triage new issues
triggers:
  - issues.opened
model:
  provider: anthropic
  name: claude-sonnet-4-5
tools:
  - github.post_comment
  - github.add_labels
---

# Your agent prompt here
```

### Step 2: Adopt the tools

The tools are the API. The tools are the actions. The tools
are the interface.

Replace your custom tool calls with `gitagent`'s standard tools
(where possible) or your custom tools (where not). The standard
tools are:

- `github.post_comment` — post a comment
- `github.add_labels` — add labels
- `github.search_issues` — search issues
- `github.create_pr` — open a PR
- `github.merge_pr` — merge a PR
- (and more — see [tools.md](./tools.md))

For custom tools, implement the `ToolDefinition` interface and
register them in the `ToolRegistry`.

### Step 3: Adopt the memory

The memory is the history. The memory is the context. The
memory is the persistence.

Replace your custom memory with `gitagent`'s memory backends:

- `InMemoryStore` — for tests and ephemeral runs
- `GitMemory` — for the default, versioned, repo-backed memory
- `SqliteMemory` — for higher-volume, indexed memory

The `EpisodicMemory` wrapper gives you a log of past events.
The `SemanticMemory` wrapper gives you vector search.

### Step 4: Adopt the runtime

The runtime is the loop. The runtime is the orchestration. The
runtime is the agent.

Replace your custom loop with `runAgent(rc)`. The runtime
handles:

- Building the context (system prompt + memory + event)
- Calling the LLM
- Executing the tool calls
- Building the next context
- Enforcing the limits
- Emitting the events

```ts
import { runAgent } from 'gitagent';

const result = await runAgent({
  manifest,
  event,
  provider,
  tools,
  memory,
  repo,
  runId,
  dryRun: false,
  logger,
});
```

The runtime does the orchestration. The manifest does the
config. The tools do the actions. The memory does the history.

## The migration checklist

- [ ] Move agent config to `.github/agents/<name>.md`
- [ ] Replace custom tool calls with standard tools
- [ ] Replace custom memory with gitagent memory backends
- [ ] Replace custom loop with `runAgent(rc)`
- [ ] Add observability (`ObserverBus` or Langfuse adapter)
- [ ] Add tests (snapshot, golden, eval)
- [ ] Add CI (lint, typecheck, test, build)
- [ ] Add a release process (semver, CHANGELOG)

## The migration timeline

A typical migration:
- **Day 1:** move the manifest. Run the agent locally.
- **Day 2:** replace the custom tools. Run the agent locally.
- **Day 3:** replace the custom memory. Run the agent locally.
- **Day 4:** replace the custom loop. Run the agent locally.
- **Day 5:** add observability. Run the agent in production.
- **Day 6+:** add tests, CI, release process.

Total: 1 week. The migration is incremental. The agent
improves with each step.

## The anti-patterns

### Anti-pattern 1: Big bang

You try to migrate everything at once. The agent breaks. The
user is confused. The migration fails.

**The fix:** migrate one piece at a time. Each piece is
deployed. Each piece is tested. The migration is safe.

### Anti-pattern 2: Skip the tests

You migrate the code but not the tests. The agent breaks in
production. The user is affected. The migration fails.

**The fix:** add tests for each piece. The tests are the
safety net. The safety net is the migration.

### Anti-pattern 3: Skip the observability

You migrate the code but not the observability. The agent
fails silently. The user is confused. The migration fails.

**The fix:** add observability for each piece. The
observability is the visibility. The visibility is the
migration.

## The lesson

4 steps. 1 week. 1 lesson: migrate incrementally.

The agent that migrates incrementally is safe. The agent that
migrates all at once is risky. The choice is yours.

The agent era is here. The migration is the choice. The
choice is the discipline. The discipline is the success.
