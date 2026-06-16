/**
 * Zod schemas for the gitagent manifest format.
 *
 * A manifest is a `.github/agents/<name>.md` file with:
 *   - YAML frontmatter (validated by these schemas)
 *   - Markdown body (used as the agent's system prompt / personality)
 *
 * See: docs/manifest-spec.md for the full specification.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Event triggers                                                      */
/* ------------------------------------------------------------------ */

/**
 * The set of GitHub events that a manifest can subscribe to.
 * Each value maps 1:1 to a GitHub webhook event name (with `.` as the
 * action separator for events that have actions).
 */
export const GitHubEventSchema = z.enum([
  // Issues
  'issues.opened',
  'issues.edited',
  'issues.closed',
  'issues.reopened',
  'issues.labeled',
  'issues.unlabeled',
  'issues.assigned',
  'issues.unassigned',

  // Issue comments
  'issue_comment.created',
  'issue_comment.edited',
  'issue_comment.deleted',

  // Pull requests
  'pull_request.opened',
  'pull_request.edited',
  'pull_request.closed',
  'pull_request.reopened',
  'pull_request.synchronize',
  'pull_request.ready_for_review',
  'pull_request.labeled',
  'pull_request.assigned',
  'pull_request.review_requested',
  'pull_request.review_request_removed',

  // PR reviews
  'pull_request_review.submitted',
  'pull_request_review.edited',
  'pull_request_review.dismissed',

  // PR review comments
  'pull_request_review_comment.created',
  'pull_request_review_comment.edited',
  'pull_request_review_comment.deleted',

  // PR commits / comments
  'pull_request_commit.created',
  'pull_request_comment.created',

  // Releases
  'release.published',
  'release.unpublished',
  'release.created',
  'release.edited',
  'release.deleted',

  // Discussions
  'discussion.created',
  'discussion.edited',
  'discussion.deleted',
  'discussion_comment.created',
  'discussion_comment.edited',
  'discussion_comment.deleted',

  // Workflows
  'workflow_run.completed',
  'workflow_run.requested',
  'workflow_job.completed',

  // Schedule (cron-like, agent-initiated)
  'schedule.daily',
  'schedule.weekly',
  'schedule.monthly',

  // Webhook (arbitrary user POST)
  'webhook',

  // Manual (operator runs the agent by hand)
  'manual',
]);

export type GitHubEvent = z.infer<typeof GitHubEventSchema>;

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

export const MemoryTypeSchema = z.enum(['git', 'sqlite', 'in-memory']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryConfigSchema = z.object({
  /** Storage backend. Defaults to 'git' (memory files in the repo). */
  type: MemoryTypeSchema.default('git'),
  /** Path under .github/agents/<name>/ where memory files live. */
  path: z.string().default('memory'),
  /** Maximum memory size in bytes before compaction kicks in. */
  maxSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
  /** Whether to use semantic (vector) memory in addition to episodic. */
  semantic: z.boolean().default(false),
  /** Embedding model for semantic memory (provider-agnostic name). */
  embeddingModel: z.string().optional(),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * A tool reference is either a bare string ("github.post_comment") or a
 * full object with overrides ("{ name: 'github.post_comment', approval: 'never' }").
 */
export const ToolRefSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    approval: z.enum(['always', 'never', 'required']).optional(),
    description: z.string().optional(),
  }),
]);
export type ToolRef = z.infer<typeof ToolRefSchema>;

/* ------------------------------------------------------------------ */
/* Approval                                                            */
/* ------------------------------------------------------------------ */

/**
 * Approval policy. 'never' = no approval, 'always' = always require, 'required' =
 * approval required for non-trivial inputs (the policy is defined per tool).
 */
export const ApprovalPolicySchema = z.object({
  read: z.enum(['never', 'always', 'required']).default('never'),
  write: z.enum(['never', 'always', 'required']).default('required'),
  /** If true, the agent will run read-only first, then post a plan for approval. */
  planFirst: z.boolean().default(false),
  /** Mentions to ping when approval is required (e.g. ['@maintainers']). */
  mention: z.array(z.string()).default([]),
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export const ModelProviderSchema = z.enum([
  'anthropic',
  'openai',
  'openai-compatible',
  'google',
  'mistral',
  'cohere',
  'custom',
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelConfigSchema = z.object({
  provider: ModelProviderSchema.default('anthropic'),
  name: z.string().default('claude-sonnet-4-5'),
  /** Base URL for OpenAI-compatible providers. Ignored by first-party providers. */
  baseURL: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().positive().default(4096),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const LimitsConfigSchema = z.object({
  /** Max LLM calls per agent run. */
  maxSteps: z.number().int().positive().default(15),
  /** Hard timeout per agent run, in milliseconds. */
  timeoutMs: z.number().int().positive().default(120_000),
  /** Max tokens (input + output) per run. */
  maxTotalTokens: z.number().int().positive().default(200_000),
  /** Max tool calls per run. */
  maxToolCalls: z.number().int().positive().default(30),
});
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */

export const ScheduleConfigSchema = z.object({
  /** Cron expression. */
  cron: z.string(),
  /** Timezone for the cron. Defaults to UTC. */
  timezone: z.string().default('UTC'),
  /** Optional human-readable description. */
  description: z.string().optional(),
});
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

/* ------------------------------------------------------------------ */
/* Permissions (what the agent is allowed to do)                       */
/* ------------------------------------------------------------------ */

export const PermissionsConfigSchema = z.object({
  /** Repositories the agent may operate on (regex). Default: only the host repo. */
  repositories: z.array(z.string()).default([]),
  /** Whether the agent may push to protected branches. */
  protectedBranches: z.boolean().default(false),
  /** Whether the agent may close issues. */
  closeIssues: z.boolean().default(true),
  /** Whether the agent may merge PRs. */
  mergePRs: z.boolean().default(false),
  /** Whether the agent may create releases. */
  release: z.boolean().default(false),
  /** Whether the agent may spend money (call paid APIs). */
  spend: z.boolean().default(false),
});
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

/* ------------------------------------------------------------------ */
/* Manifest frontmatter                                                */
/* ------------------------------------------------------------------ */

export const ManifestFrontmatterSchema = z.object({
  /** Agent name. Lowercase, alphanumeric + hyphens. */
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'name must be lowercase alphanumeric + hyphens'),

  /** Human-readable description. */
  description: z.string().max(280).optional(),

  /** Event triggers. */
  triggers: z.array(GitHubEventSchema).min(1),

  /** Optional schedule. If set, the agent runs on a cron too. */
  schedule: ScheduleConfigSchema.optional(),

  /** System prompt / personality. Pulled from the body, but can be overridden here. */
  personality: z.string().optional(),

  /** Memory configuration. */
  memory: MemoryConfigSchema.default({}),

  /** Tools the agent can use. */
  tools: z.array(ToolRefSchema).default([]),

  /** Approval policy. */
  approval: ApprovalPolicySchema.default({}),

  /** LLM model configuration. */
  model: ModelConfigSchema.default({}),

  /** Execution limits. */
  limits: LimitsConfigSchema.default({}),

  /** Permissions. */
  permissions: PermissionsConfigSchema.default({}),

  /** Free-form metadata for tooling. */
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ManifestFrontmatter = z.infer<typeof ManifestFrontmatterSchema>;

/* ------------------------------------------------------------------ */
/* Full manifest (frontmatter + body)                                  */
/* ------------------------------------------------------------------ */

export const ManifestSchema = z.object({
  /** The frontmatter block, validated. */
  frontmatter: ManifestFrontmatterSchema,
  /** The markdown body, raw. Used as the default personality / system prompt. */
  body: z.string(),
  /** Absolute path to the file the manifest was loaded from. */
  path: z.string(),
});
export type Manifest = z.infer<typeof ManifestSchema>;
