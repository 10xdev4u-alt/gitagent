# Architecture

`gitagent` is built from a few composable modules. The mental model:

```
┌──────────────────┐
│  Manifest (MD)   │   .github/agents/<name>.md
└────────┬─────────┘
         │ load + validate
         ▼
┌──────────────────┐
│ ManifestRegistry │   In-memory map of all agents
└────────┬─────────┘
         │ lookup by event
         ▼
┌──────────────────┐    ┌────────────────┐
│  AgentRunner     │───▶│  LLMProvider   │  Anthropic, OpenAI, etc.
└────────┬─────────┘    └────────────────┘
         │ call tools
         ▼
┌──────────────────┐
│  ToolRegistry    │   github.* tools, memory.* tools, custom
└────────┬─────────┘
         │ execute
         ▼
┌──────────────────┐
│     Octokit      │   GitHub REST API
└──────────────────┘

┌──────────────────┐    ┌────────────────┐
│     Memory       │───▶│  Persistence   │  git, sqlite, in-memory
└──────────────────┘    └────────────────┘
```

## Module map

| Subpath | Responsibility |
|---|---|
| `gitagent/manifest` | Schema (Zod), loader, registry, event matcher. |
| `gitagent/providers` | LLM provider adapters + registry. |
| `gitagent/tools` | Tool interface, registry, GitHub + memory tools. |
| `gitagent/memory` | Memory backends (git, sqlite, in-memory) + episodic/semantic. |
| `gitagent/skills` | Bundled tool + personality collections. |
| `gitagent/runtime` | The agent execution loop. |
| `gitagent/server` | Hono-based webhook server + GitHub App auth. |
| `gitagent` (top) | Re-exports the major subpaths. |

## Lifecycle of an agent run

1. **Webhook arrives.** GitHub POSTs to `/webhook` with an event payload.
2. **Signature verified.** The server checks `X-Hub-Signature-256` against the configured secret.
3. **Event normalized.** `normalizeWebhook` converts the raw event to `{ name, action, payload }`.
4. **Agent matched.** `matchManifests` finds agents subscribed to this event.
5. **For each matched agent:**
   1. **Memory built.** From the manifest's `memory.type` config.
   2. **Tools built.** `createDefaultToolRegistry` produces the standard tool set.
   3. **Provider picked.** From the manifest's `model.provider` field.
   4. **Run loop:**
      - Build messages (system prompt + memory + event).
      - Call the LLM with the tools.
      - If the LLM returns tool calls, execute them.
      - Add tool results to the messages and loop.
      - Stop on: LLM returns text only, `maxSteps`, `maxToolCalls`, `maxTotalTokens`, `timeout`, abort.
6. **Results returned.** The server responds with `{ ok, matched, results }`.

## Key design decisions

### The agent is a Markdown file

A `.github/agents/<name>.md` file is the entire unit of configuration.
YAML frontmatter for config, Markdown body for personality. This makes
agents:
- Diff-able
- Review-able
- Version-controllable
- Inspectable in any text editor
- Composable (you can copy-paste parts of one agent into another)

### Memory is git-versioned

The default `git` memory backend stores entries as files in
`.github/agents/<name>/memory/`. Every write is a file in the repo. The
agent's memory is part of the project's history.

Alternatives:
- `sqlite` for indexed, single-file persistent memory.
- `in-memory` for tests and ephemeral runs.
- Wrap either in `SemanticMemory` for vector search.

### Tools are GitHub-native

The standard tool set covers comments, labels, issues, PRs, reviews,
reactions, and CI. The agent acts like a human maintainer — same
primitives, same audit trail.

Custom tools are first-class: implement `ToolDefinition`, register with
`ToolRegistry`, and the agent can use them.

### LLM providers are pluggable

The `LLMProvider` interface is provider-agnostic. Anthropic, OpenAI,
and OpenAI-compatible (Ollama, vLLM, Together, etc.) are built in. Add
a new one in ~50 lines.

### Approval is the default

Every write tool defaults to `approval: required`. The runner pauses
and asks the caller. Without a callback, the run is blocked. This is
the right default for an agent that can act on your behalf.

### Permissions are defense in depth

Even if a tool is in the `tools:` list, the agent can't use it unless
the corresponding `permissions.` flag is enabled. `mergePRs: false`
means `github.merge_pr` is a no-op. The manifest can be wrong; the
permissions are the final gate.

## Threading model

Single-threaded Node.js / Bun. The agent runner is `async` and uses
`for await` loops. Long-running runs are bounded by `limits.timeoutMs`.

If you need concurrency, run multiple agent processes (one per repo, or
one per event). The server can handle many in-flight webhooks in
parallel.

## Extension points

- **Custom providers:** implement `LLMProvider`, register in `ProviderRegistry`.
- **Custom tools:** implement `ToolDefinition`, register in `ToolRegistry`.
- **Custom memory:** implement `Memory` (or `SearchableMemory`), pass to the runner.
- **Custom observers:** pass an `ObserverBus` to the runner to subscribe to events.
- **Custom approval flow:** implement the approval callback in your server.
- **Custom skills:** drop a JSON file in `.github/agents/skills/`, use it from a manifest.

## See also

- [README.md](../README.md) — quick start
- [manifest-spec.md](./manifest-spec.md) — manifest format
- [tools.md](./tools.md) — tool reference
- [SECURITY.md](../SECURITY.md) — threat model
