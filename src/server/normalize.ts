/**
 * Webhook event normalization.
 *
 * GitHub sends a single POST for each event with the event name in
 * the `X-GitHub-Event` header. The payload's shape depends on the event
 * type. This module normalizes the event into the form expected by
 * the agent runtime.
 */

import type { GitHubEvent } from '../manifest/schema.js';

export interface NormalizedEvent {
  name: GitHubEvent | string;
  action?: string;
  payload: unknown;
  deliveryId: string;
  installationId?: number;
}

export function normalizeWebhook(
  eventName: string,
  payload: Record<string, unknown>,
  deliveryId: string,
  installationId?: number,
): NormalizedEvent {
  let normalized: GitHubEvent | string = eventName;
  let action: string | undefined;
  if (eventName === 'issues' && typeof payload.action === 'string') {
    normalized = `issues.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'issue_comment' && typeof payload.action === 'string') {
    normalized = `issue_comment.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'pull_request' && typeof payload.action === 'string') {
    normalized = `pull_request.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'pull_request_review' && typeof payload.action === 'string') {
    normalized = `pull_request_review.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'pull_request_review_comment' && typeof payload.action === 'string') {
    normalized = `pull_request_review_comment.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'release' && typeof payload.action === 'string') {
    normalized = `release.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'discussion' && typeof payload.action === 'string') {
    normalized = `discussion.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'discussion_comment' && typeof payload.action === 'string') {
    normalized = `discussion_comment.${payload.action}`;
    action = payload.action;
  } else if (eventName === 'workflow_run' && typeof payload.action === 'string') {
    normalized = `workflow_run.${payload.action}`;
    action = payload.action;
  }
  return {
    name: normalized,
    ...(action ? { action } : {}),
    payload,
    deliveryId,
    ...(installationId !== undefined ? { installationId } : {}),
  };
}
