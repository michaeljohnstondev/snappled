// Shared validation for user-created prompts

const MAX_LENGTH = 75;

// Words that would get the app flagged by App Store / Play Store moderation
const BANNED_WORDS = [
  // Slurs that would get auto-rejected
  'fag', 'faggot', 'nigger', 'nigga',
  'tranny', 'kike', 'spic', 'chink', 'gook',
  // Explicit sexual content / spam
  'porn', 'pornhub', 'onlyfans', 'cum', 'jizz', 'dick pic',
  // Self-harm (stores are strict on this)
  'kys', 'kill yourself',
];

const URL_REGEX = /(https?:\/\/|www\.|\.com|\.net|\.org|\.io|\.gg)/i;
const PHONE_REGEX = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;

export function validatePrompt(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Please enter a prompt' };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Please enter a prompt' };
  }

  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, error: `Prompt must be ${MAX_LENGTH} characters or less` };
  }

  // Must contain letters (no all-numbers or symbols)
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { valid: false, error: 'Prompt must contain letters' };
  }

  // No URLs
  if (URL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Links are not allowed in prompts' };
  }

  // No phone numbers
  if (PHONE_REGEX.test(trimmed)) {
    return { valid: false, error: 'Phone numbers are not allowed in prompts' };
  }

  // No excessive repeated characters (e.g. "aaaaaaaaa")
  if (/(.)\1{5,}/.test(trimmed)) {
    return { valid: false, error: 'Too many repeated characters' };
  }

  // Banned words check (whole word match, case insensitive)
  const lower = trimmed.toLowerCase();
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      return { valid: false, error: 'Contains language that is not allowed' };
    }
  }

  return { valid: true, cleaned: trimmed };
}

export const PROMPT_MAX_LENGTH = MAX_LENGTH;
