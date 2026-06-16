/**
 * Custom error types for the tools module.
 */

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'EXECUTION_FAILED'
  | 'PERMISSION_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'GITHUB_API_ERROR'
  | 'TIMEOUT';

export class ToolError extends Error {
  public readonly code: ToolErrorCode;
  public readonly toolName: string;
  public readonly cause: unknown | undefined;

  constructor(toolName: string, code: ToolErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = 'ToolError';
    this.toolName = toolName;
    this.code = code;
    this.cause = options.cause;
  }
}

export class ApprovalRequiredError extends ToolError {
  public readonly plan: unknown;

  constructor(toolName: string, plan: unknown, message = 'Tool execution requires approval') {
    super(toolName, 'APPROVAL_REQUIRED', message);
    this.name = 'ApprovalRequiredError';
    this.plan = plan;
  }
}
