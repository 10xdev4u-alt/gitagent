/**
 * gitagent — persistent, versioned AI agents that live in your GitHub repository.
 *
 * Public top-level entry. Re-exports the major subpaths.
 *
 *   import { loadManifest, runAgent, createApp } from 'gitagent';
 *
 * Subpaths:
 *   gitagent/manifest   — manifest loading + validation
 *   gitagent/providers  — LLM provider adapters
 *   gitagent/tools      — tool framework + GitHub tools
 *   gitagent/memory     — memory backends (git, in-memory, semantic, episodic)
 *   gitagent/runtime    — agent execution loop
 *   gitagent/server     — webhook server
 *   gitagent/cli        — CLI entry (use the `gitagent` bin)
 */

export * from './manifest/index.js';
export * as Providers from './providers/index.js';
export * as Tools from './tools/index.js';
export * from './memory/index.js';
export * as Runtime from './runtime/index.js';
export * as Server from './server/index.js';
export * as Skills from './skills/index.js';
