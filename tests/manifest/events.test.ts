/**
 * Tests for the GitHub events schema.
 */

import { describe, expect, it } from 'vitest';
import { GitHubEventSchema } from '../../src/manifest/schema.js';

describe('GitHubEventSchema', () => {
  it('accepts known issue events', () => {
    expect(GitHubEventSchema.parse('issues.opened')).toBe('issues.opened');
    expect(GitHubEventSchema.parse('issues.closed')).toBe('issues.closed');
    expect(GitHubEventSchema.parse('issues.labeled')).toBe('issues.labeled');
  });

  it('accepts known pull request events', () => {
    expect(GitHubEventSchema.parse('pull_request.opened')).toBe('pull_request.opened');
    expect(GitHubEventSchema.parse('pull_request.closed')).toBe('pull_request.closed');
    expect(GitHubEventSchema.parse('pull_request.synchronize')).toBe('pull_request.synchronize');
  });

  it('accepts known issue_comment events', () => {
    expect(GitHubEventSchema.parse('issue_comment.created')).toBe('issue_comment.created');
  });

  it('accepts known workflow_run events', () => {
    expect(GitHubEventSchema.parse('workflow_run.completed')).toBe('workflow_run.completed');
  });

  it('accepts schedule events', () => {
    expect(GitHubEventSchema.parse('schedule.daily')).toBe('schedule.daily');
    expect(GitHubEventSchema.parse('schedule.weekly')).toBe('schedule.weekly');
  });

  it('accepts manual events', () => {
    expect(GitHubEventSchema.parse('manual')).toBe('manual');
  });

  it('accepts webhook events', () => {
    expect(GitHubEventSchema.parse('webhook')).toBe('webhook');
  });

  it('rejects unknown events', () => {
    expect(() => GitHubEventSchema.parse('totally.fake.event')).toThrow();
  });
});
