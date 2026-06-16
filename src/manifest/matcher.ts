/**
 * Event matcher.
 *
 * Given a GitHub event (already normalized to a `GitHubEvent` string),
 * find the manifests that should handle it, ordered by priority.
 *
 * Matching rules:
 * 1. Manifests with the exact event in their `triggers` list.
 * 2. Within those, the manifest with the longest trigger list wins (more
 *    specific = higher priority). This lets a triage agent declare multiple
 *    triggers and still get picked over a generic fallback.
 * 3. Ties broken by alphabetical name (deterministic).
 */

import type { GitHubEvent, Manifest } from './schema.js';

export interface MatchResult {
  manifest: Manifest;
  /** Why this manifest was chosen (for logging / debugging). */
  reason: string;
}

export function matchManifests(
  manifests: Manifest[],
  event: GitHubEvent,
): MatchResult[] {
  const matches = manifests.filter((m) => m.frontmatter.triggers.includes(event));
  matches.sort((a, b) => {
    const aLen = a.frontmatter.triggers.length;
    const bLen = b.frontmatter.triggers.length;
    if (aLen !== bLen) return bLen - aLen; // more specific first
    return a.frontmatter.name.localeCompare(b.frontmatter.name);
  });
  return matches.map((manifest) => {
    const len = manifest.frontmatter.triggers.length;
    return {
      manifest,
      reason:
        len === 1
          ? `only manifest subscribed to ${event}`
          : `manifest has ${len} triggers; matched on ${event}`,
    };
  });
}

/**
 * Given an event name (e.g. "issues.opened"), normalize it into a `GitHubEvent`.
 *
 * Accepts the raw webhook event name + action (e.g. event="issues", action="opened")
 * and combines them. Falls back to the original event if no action is given.
 */
export function normalizeEvent(event: string, action?: string): GitHubEvent | null {
  if (action) {
    return `${event}.${action}` as GitHubEvent;
  }
  return event as GitHubEvent;
}
