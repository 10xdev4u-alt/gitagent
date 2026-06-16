# Contributing

Thanks for your interest in `gitagent`! This is a young project and we
welcome contributions of all kinds.

## Quick start

```bash
git clone https://github.com/10xdev4u-alt/gitagent
cd gitagent
npm install
npm test
```

The repo uses **npm** as the package manager and **Node.js >= 20**. Bun
also works for running tests and the CLI.

## Workflow

1. **Open an issue first** for non-trivial changes. We use issues to
   align on direction before code.
2. **Branch from `main`**. Use a descriptive name (`feat/add-cron`,
   `fix/post-comment-error`, `docs/update-readme`).
3. **Write tests.** Every new feature should ship with at least one
   test. Bug fixes should ship with a regression test.
4. **Run the test suite and linter before pushing:**
   ```bash
   npm run typecheck
   npm test
   npm run lint
   ```
5. **Open a pull request** with a clear description. Reference the
   issue it closes.

## Project layout

```
src/
  manifest/    - Manifest schema, loader, registry, matcher
  providers/   - LLM provider adapters (Anthropic, OpenAI, ...)
  tools/       - Tool framework + GitHub + memory tools
  memory/      - Memory backends (git, in-memory, semantic, episodic)
  runtime/     - Agent execution loop
  server/      - Hono-based webhook server
  cli/         - CLI command implementations
  cli.ts       - CLI entry point
  index.ts     - Top-level public API
tests/
  manifest/    - Manifest tests
  providers/   - Provider tests (with mocked SDKs)
  tools/       - Tool tests (with mocked Octokit)
  memory/      - Memory tests
  runtime/     - Runtime tests (with mock LLM)
  server/      - Server tests (using Hono's request API)
  cli/         - CLI tests
examples/
  triage/      - Issue triage agent
  doc/         - Doc-sync agent
  release/     - Release preparation agent
  review/      - PR review agent
```

## Coding conventions

- **TypeScript** with `strict: true` and `noUncheckedIndexedAccess: true`.
- **Zod** for runtime validation; **never** `any` in public APIs.
- **Biome** for formatting and linting.
- **No AI names** in commit messages, code comments, or doc strings.
- **Atomic commits** with conventional commit prefixes
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`).
- **100% test pass rate** is required for merge.

## Adding a new tool

1. Create a `make<Name>Tool` factory in `src/tools/<area>.ts`.
2. Register it in `src/tools/defaults.ts`.
3. Add tests in `tests/tools/<area>.test.ts` using a mocked Octokit.
4. Update the `README.md` tool list.

## Adding a new LLM provider

1. Create `src/providers/<name>.ts` implementing `LLMProvider`.
2. Register it in `src/providers/registry.ts`.
3. Add tests in `tests/providers/<name>.test.ts` using a mock client.
4. Update the `README.md` provider list.

## Adding a new memory backend

1. Create `src/memory/<name>.ts` implementing `Memory` (or
   `SearchableMemory` if you support search).
2. Update the `MemoryType` enum in `src/manifest/schema.ts`.
3. Add tests in `tests/memory/<name>.test.ts`.
4. Update the `README.md` memory list.

## Release process

1. Bump the version in `package.json`.
2. Add a `CHANGELOG.md` entry under a new heading.
3. Commit, push, and tag: `git tag v0.X.Y && git push --tags`.
4. CI auto-publishes to npm.

## Community

- **Issues:** bug reports, feature requests
- **Discussions:** questions, design ideas, show-and-tell
- **Pull requests:** code contributions

We aim to be a friendly, low-friction project. First-time contributors
welcome.
