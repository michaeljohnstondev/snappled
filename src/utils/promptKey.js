// Canonical normalization for prompt text. Used as the de-dup key across
// activePrompts, onDeckPrompts, promptPool, and bannedPromptTexts so the
// summon flow can detect duplicates regardless of case/punctuation drift.
//
// Rules:
//   - lowercase
//   - trim ends
//   - strip leading/trailing punctuation
//   - collapse internal whitespace to single space
//   - drop emoji-style symbols and most punctuation, keep alphanumerics + space
export function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
