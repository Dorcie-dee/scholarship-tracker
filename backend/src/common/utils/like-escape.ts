/**
 * Escapes PostgreSQL LIKE / ILIKE metacharacters so user input is treated as
 * a literal substring, not a pattern. Pair with `ESCAPE '\\'` in SQL.
 *
 * Shared primitive — do not reimplement inside individual services.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Builds a case-insensitive substring pattern: `%escaped%`. */
export function likeContainsPattern(raw: string): string {
  return `%${escapeLikePattern(raw)}%`;
}
