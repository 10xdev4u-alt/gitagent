# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release of `gitagent`.
- Manifest format: `.github/agents/<name>.md` with YAML frontmatter + markdown body.
- LLM providers: Anthropic, OpenAI, OpenAI-compatible (Ollama, vLLM, etc.).
- GitHub tools: `post_comment`, `add_labels`, `remove_label`, `close_issue`,
  `reopen_issue`, `assign`, `search_issues`, `create_pr`, `request_review`,
  `merge_pr`, `add_reaction`.
- Memory backends: `git` (file-backed, versioned), `in-memory` (tests),
  `semantic` (hash-based bag-of-words with cosine similarity),
  `episodic` (append-only log).
- Agent runtime: multi-step tool execution loop with limits enforcement
  (`maxSteps`, `maxTokens`, `maxToolCalls`, `timeoutMs`).
- Approval flow: per-tool approval policy with read/write separation.
- Webhook server: Hono-based with signature verification, agent matching,
  per-repo memory isolation.
- CLI: `init`, `validate`, `dev`, `serve`, `list`, `config`.
- Example agents: `triage`, `doc`, `release`, `review`.

[Unreleased]: https://github.com/10xdev4u-alt/gitagent/compare/HEAD
