/**
 * Approximate token counting.
 *
 * Uses a character-based heuristic (chars / 4) which is close enough for
 * most LLMs. For exact counts, swap in a tokenizer like gpt-tokenizer.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  for (const m of messages) {
    // Per-message overhead (role, separators)
    total += 4 + estimateTokens(m.content);
  }
  return total;
}
