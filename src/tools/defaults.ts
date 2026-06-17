/**
 * The default tool factory.
 *
 * Builds a {@link ToolRegistry} pre-loaded with all standard GitHub tools
 * (comments, labels, issues, PRs, reactions, search). Pass a custom
 * {@link GitHubClientOptions} to configure the auth token.
 */

import type { GitHubClientOptions } from './github-client.js';
import { ToolRegistry } from './registry.js';
import type { ToolDefinition } from './types.js';
import {
  makeAddLabelsTool,
  makePostCommentTool,
  makeRemoveLabelTool,
} from './github-comments.js';
import {
  makeAssignTool,
  makeCloseIssueTool,
  makeCreateIssueTool,
  makeReopenIssueTool,
  makeSearchIssuesTool,
  makeUpdateIssueTool,
} from './github-issues.js';
import {
  makeAddReactionTool,
  makeCreatePRTool,
  makeMergePRTool,
  makeRequestReviewTool,
} from './github-prs.js';
import {
  makeGetFileTool,
  makeListIssuesTool,
  makeListPullRequestsTool,
  makeListWorkflowRunsTool,
} from './github-read.js';

/** Build a registry with all default tools registered. */
export function createDefaultToolRegistry(options: GitHubClientOptions): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of defaultTools(options)) {
    registry.register(tool);
  }
  return registry;
}

/** List all default tools without registering them. */
export function defaultTools(options: GitHubClientOptions): ToolDefinition[] {
  return [
    makePostCommentTool(options),
    makeAddLabelsTool(options),
    makeRemoveLabelTool(options),
    makeCloseIssueTool(options),
    makeReopenIssueTool(options),
    makeAssignTool(options),
    makeSearchIssuesTool(options),
    makeCreateIssueTool(options),
    makeUpdateIssueTool(options),
    makeCreatePRTool(options),
    makeRequestReviewTool(options),
    makeMergePRTool(options),
    makeAddReactionTool(options),
    makeGetFileTool(options),
    makeListWorkflowRunsTool(options),
    makeListIssuesTool(options),
    makeListPullRequestsTool(options),
  ];
}
