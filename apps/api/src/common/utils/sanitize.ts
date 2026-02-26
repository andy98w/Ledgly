/**
 * Strip HTML tags, collapse whitespace, and trim.
 * Returns null for empty/whitespace-only input.
 */
export function sanitizeText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
