/**
 * Approximate cost tracking.
 *
 * Uses public list prices for popular models. These numbers are APPROXIMATE
 * and should be replaced with real billing data for production use.
 *
 * Costs are in USD per million tokens (MTok).
 */

import type { TokenUsage } from '../providers/types.js';

interface ModelCost {
  inputPerMTok: number;
  outputPerMTok: number;
}

const COSTS: Record<string, ModelCost> = {
  // Anthropic
  'claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-haiku-4': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
  // OpenAI
  'gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'gpt-4-turbo': { inputPerMTok: 10, outputPerMTok: 30 },
  'o1': { inputPerMTok: 15, outputPerMTok: 60 },
  'o1-mini': { inputPerMTok: 3, outputPerMTok: 12 },
  'o3-mini': { inputPerMTok: 1.1, outputPerMTok: 4.4 },
  // Google
  'gemini-2.5-pro': { inputPerMTok: 1.25, outputPerMTok: 10 },
  'gemini-2.5-flash': { inputPerMTok: 0.3, outputPerMTok: 2.5 },
};

/** Estimate cost in USD for a given model and token usage. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const cost = COSTS[model] ?? { inputPerMTok: 1, outputPerMTok: 3 }; // conservative default
  const input = (usage.inputTokens / 1_000_000) * cost.inputPerMTok;
  const output = (usage.outputTokens / 1_000_000) * cost.outputPerMTok;
  return input + output;
}

/** Add cost to a TokenUsage object (mutates and returns). */
export function withCost(usage: TokenUsage, model: string): TokenUsage {
  return { ...usage, costUsd: estimateCostUsd(model, usage) };
}

/** List all models with known costs. */
export function knownModels(): string[] {
  return Object.keys(COSTS);
}
